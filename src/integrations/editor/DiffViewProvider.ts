import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { createDirectoriesForFile } from "../../utils/fs"
import { arePathsEqual } from "../../utils/path"
import { formatResponse } from "../../core/prompts/responses"
import { DecorationController } from "./DecorationController"
import * as diff from "diff"
import { diagnosticsToProblemsString, getNewDiagnostics } from "../diagnostics"
import { reportCodeUsage, updateCodeUsage, codeUsage, codeUsageUpdate } from "../../api/aixcoding"

export const DIFF_VIEW_URI_SCHEME = "cline-diff"

export class DiffViewProvider {
	editType?: "create" | "modify"
	isEditing = false
	originalContent: string | undefined
	private createdDirs: string[] = []
	private documentWasOpen = false
	private relPath?: string
	private newContent?: string
	private activeDiffEditor?: vscode.TextEditor
	private fadedOverlayController?: DecorationController
	private activeLineController?: DecorationController
	private streamedLines: string[] = []
	private preDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = []
	private currentTool: string = ""

	constructor(private cwd: string) {}

	async open(relPath: string): Promise<void> {
		this.relPath = relPath
		const fileExists = this.editType === "modify"
		const absolutePath = path.resolve(this.cwd, relPath)
		this.isEditing = true
		// 如果文件已打开，请确保在获取其内容之前它不是脏的
		if (fileExists) {
			const existingDocument = vscode.workspace.textDocuments.find((doc) =>
				arePathsEqual(doc.uri.fsPath, absolutePath),
			)
			if (existingDocument && existingDocument.isDirty) {
				await existingDocument.save()
			}
		}

		// 获取编辑文件之前的诊断信息，我们将比较编辑前后诊断信息，查看 cline 是否需要修复任何问题
		this.preDiagnostics = vscode.languages.getDiagnostics()

		if (fileExists) {
			this.originalContent = await fs.readFile(absolutePath, "utf-8")
		} else {
			this.originalContent = ""
		}
		// 对于新文件，创建任何必要的目录，并跟踪如果用户拒绝操作要删除的新目录
		this.createdDirs = await createDirectoriesForFile(absolutePath)
		// 确保文件存在，然后再打开它
		if (!fileExists) {
			await fs.writeFile(absolutePath, "")
		}
		// 如果文件已打开，则关闭它（必须在显示差异视图之后发生，因为如果它是唯一选项卡，则列将关闭）
		this.documentWasOpen = false
		// 关闭标签页（如果已打开）（它已在上面保存）
		const tabs = vscode.window.tabGroups.all
			.map((tg) => tg.tabs)
			.flat()
			.filter(
				(tab) => tab.input instanceof vscode.TabInputText && arePathsEqual(tab.input.uri.fsPath, absolutePath),
			)
		for (const tab of tabs) {
			if (!tab.isDirty) {
				await vscode.window.tabGroups.close(tab)
			}
			this.documentWasOpen = true
		}
		this.activeDiffEditor = await this.openDiffEditor()
		this.fadedOverlayController = new DecorationController("fadedOverlay", this.activeDiffEditor)
		this.activeLineController = new DecorationController("activeLine", this.activeDiffEditor)
		// 最初将淡出叠加应用于所有行
		this.fadedOverlayController.addLines(0, this.activeDiffEditor.document.lineCount)
		this.scrollEditorToLine(0) // 新文件会崩溃吗？
		this.streamedLines = []
	}

	async update(accumulatedContent: string, isFinal: boolean) {
		if (!this.relPath || !this.activeLineController || !this.fadedOverlayController) {
			throw new Error("必需值未设置")
		}
		this.newContent = accumulatedContent
		const accumulatedLines = accumulatedContent.split("\n")
		if (!isFinal) {
			accumulatedLines.pop() // 仅当它不是最终更新时才删除最后一行
		}

		const diffEditor = this.activeDiffEditor
		const document = diffEditor?.document
		if (!diffEditor || !document) {
			throw new Error("用户关闭了文本编辑器，无法编辑文件...")
		}

		// 将光标放在差异编辑器的开头，以使其远离流动画
		const beginningOfDocument = new vscode.Position(0, 0)
		diffEditor.selection = new vscode.Selection(beginningOfDocument, beginningOfDocument)

		const endLine = accumulatedLines.length
		// 将所有内容替换为当前行，并使用累积的行
		const edit = new vscode.WorkspaceEdit()
		const rangeToReplace = new vscode.Range(0, 0, endLine + 1, 0)
		const contentToReplace = accumulatedLines.slice(0, endLine + 1).join("\n") + "\n"
		edit.replace(document.uri, rangeToReplace, contentToReplace)
		await vscode.workspace.applyEdit(edit)
		// 更新装饰
		this.activeLineController.setActiveLine(endLine)
		this.fadedOverlayController.updateOverlayAfterLine(endLine, document.lineCount)
		// 滚动到当前行
		this.scrollEditorToLine(endLine)

		// 使用新的累积内容更新 streamedLines
		this.streamedLines = accumulatedLines
		if (isFinal) {
			// 如果新内容短于原始内容，则处理任何剩余的行
			if (this.streamedLines.length < document.lineCount) {
				const edit = new vscode.WorkspaceEdit()
				edit.delete(document.uri, new vscode.Range(this.streamedLines.length, 0, document.lineCount, 0))
				await vscode.workspace.applyEdit(edit)
			}
			// 如果原始内容有一行，则保留空行
			const hasEmptyLastLine = this.originalContent?.endsWith("\n")
			if (hasEmptyLastLine && !accumulatedContent.endsWith("\n")) {
				accumulatedContent += "\n"
			}
			// 应用最终内容
			const finalEdit = new vscode.WorkspaceEdit()
			finalEdit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), accumulatedContent)
			await vscode.workspace.applyEdit(finalEdit)
			// 在最后清除所有装饰（应用最终编辑后）
			this.fadedOverlayController.clear()
			this.activeLineController.clear()
		}
	}

	async saveChanges(): Promise<{
		newProblemsMessage: string | undefined
		userEdits: string | undefined
		finalContent: string | undefined
	}> {
		if (!this.relPath || !this.newContent || !this.activeDiffEditor) {
			return { newProblemsMessage: undefined, userEdits: undefined, finalContent: undefined }
		}
		const absolutePath = path.resolve(this.cwd, this.relPath)
		const updatedDocument = this.activeDiffEditor.document
		const editedContent = updatedDocument.getText()
		if (updatedDocument.isDirty) {
			await updatedDocument.save()
		}

		await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), { preview: false })
		await this.closeAllDiffViews()

		/*
		获取编辑文件之前和之后的诊断信息，比实时自动跟踪问题更好。此方法确保我们仅报告此特定编辑的直接结果产生的新问题。
		由于这些是 AIxCoding 编辑产生的新问题，我们知道它们与他正在执行的工作直接相关。这消除了 AIxCoding 脱离任务或因不相关问题而分心的风险，这在之前的自动调试方法中是一个问题。某些用户的机器更新诊断信息的速度可能很慢，因此这种方法在自动化和避免 AIxCoding 由于过时的信息而陷入循环的潜在问题之间取得了良好的平衡。如果用户接受更改时没有出现新问题，他们可以使用“@problems”提及随时进行调试。
		这样，AIxCoding 只会注意到他编辑产生的新问题，并可以相应地解决这些问题。如果应用修复后问题没有立即改变，则不会收到通知，这通常是可以的，因为初始修复通常是正确的，并且可能需要一些时间才能让代码检查工具赶上。
		*/
		const postDiagnostics = vscode.languages.getDiagnostics()
		const newProblems = diagnosticsToProblemsString(
			getNewDiagnostics(this.preDiagnostics, postDiagnostics),
			[
				vscode.DiagnosticSeverity.Error, // 仅包含错误，因为警告可能会分散注意力（如果用户想修复警告，他们可以使用“@problems”提及）
			],
			this.cwd,
		) // 如果没有错误，则为空字符串
		const newProblemsMessage = newProblems.length > 0 ? `\n\n保存文件后检测到新问题：\n${newProblems}` : ""

		// 如果编辑的内容具有不同的 EOL 字符，我们不想显示包含所有 EOL 差异的差异。
		const newContentEOL = this.newContent.includes("\r\n") ? "\r\n" : "\n"
		const normalizedEditedContent = editedContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL // trimEnd 用于修复编辑器自动添加额外换行符的问题
		// 以防新内容混合了各种不同的 EOL 字符
		const normalizedNewContent = this.newContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL
		if (normalizedEditedContent !== normalizedNewContent) {
			// 用户在批准编辑之前进行了更改
			const userEdits = formatResponse.createPrettyPatch(
				this.relPath.toPosix(),
				normalizedNewContent,
				normalizedEditedContent,
			)
			this.updateDiffApprove(2)
			return { newProblemsMessage, userEdits, finalContent: normalizedEditedContent }
		} else {
			this.updateDiffApprove(1)
			// 对 AIxCoding 的编辑没有更改
			return { newProblemsMessage, userEdits: undefined, finalContent: normalizedEditedContent }
		}
	}

	async revertChanges(): Promise<void> {
		if (!this.relPath || !this.activeDiffEditor) {
			return
		}
		this.updateDiffApprove(4)
		const fileExists = this.editType === "modify"
		const updatedDocument = this.activeDiffEditor.document
		const absolutePath = path.resolve(this.cwd, this.relPath)
		if (!fileExists) {
			if (updatedDocument.isDirty) {
				await updatedDocument.save()
			}
			await this.closeAllDiffViews()
			await fs.unlink(absolutePath)
			// 只删除我们创建的目录，反向顺序
			for (let i = this.createdDirs.length - 1; i >= 0; i--) {
				await fs.rmdir(this.createdDirs[i])
				console.log(`目录 ${this.createdDirs[i]} 已删除。`)
			}
			console.log(`文件 ${absolutePath} 已删除。`)
		} else {
			// 恢复文档
			const edit = new vscode.WorkspaceEdit()
			const fullRange = new vscode.Range(
				updatedDocument.positionAt(0),
				updatedDocument.positionAt(updatedDocument.getText().length),
			)
			edit.replace(updatedDocument.uri, fullRange, this.originalContent ?? "")
			// 应用编辑并保存，因为内容不应该更改，所以除非用户在编辑期间进行了更改并保存，否则不会显示在本地历史记录中
			await vscode.workspace.applyEdit(edit)
			await updatedDocument.save()
			console.log(`文件 ${absolutePath} 已恢复到其原始内容。`)
			if (this.documentWasOpen) {
				await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), {
					preview: false,
				})
			}
			await this.closeAllDiffViews()
		}

		// 编辑完成
		await this.reset()
	}

	private async closeAllDiffViews() {
		const tabs = vscode.window.tabGroups.all
			.flatMap((tg) => tg.tabs)
			.filter(
				(tab) =>
					tab.input instanceof vscode.TabInputTextDiff &&
					tab.input?.original?.scheme === DIFF_VIEW_URI_SCHEME,
			)
		for (const tab of tabs) {
			// 尝试关闭脏视图会导致保存弹出窗口
			if (!tab.isDirty) {
				await vscode.window.tabGroups.close(tab)
			}
		}
	}

	private async openDiffEditor(): Promise<vscode.TextEditor> {
		if (!this.relPath) {
			throw new Error("未设置文件路径")
		}
		const uri = vscode.Uri.file(path.resolve(this.cwd, this.relPath))
		// 如果此差异编辑器已打开（即如果之前的写入文件被中断），则我们应该激活它，而不是打开新的差异
		const diffTab = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.find(
				(tab) =>
					tab.input instanceof vscode.TabInputTextDiff &&
					tab.input?.original?.scheme === DIFF_VIEW_URI_SCHEME &&
					arePathsEqual(tab.input.modified.fsPath, uri.fsPath),
			)
		if (diffTab && diffTab.input instanceof vscode.TabInputTextDiff) {
			const editor = await vscode.window.showTextDocument(diffTab.input.modified)
			return editor
		}
		// 打开新的差异编辑器
		return new Promise<vscode.TextEditor>((resolve, reject) => {
			const fileName = path.basename(uri.fsPath)
			const fileExists = this.editType === "modify"
			const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor && arePathsEqual(editor.document.uri.fsPath, uri.fsPath)) {
					disposable.dispose()
					resolve(editor)
				}
			})
			vscode.commands.executeCommand(
				"vscode.diff",
				vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${fileName}`).with({
					query: Buffer.from(this.originalContent ?? "").toString("base64"),
				}),
				uri,
				`${fileName}: ${fileExists ? "原始文件 ↔ AIxCoding 的更改" : "新建文件"} (可编辑)`,
			)
			// 这可能发生在非常慢的机器上，例如项目索引
			setTimeout(() => {
				disposable.dispose()
				reject(new Error("无法打开差异编辑器，请重试..."))
			}, 10_000)
		})
	}

	private scrollEditorToLine(line: number) {
		if (this.activeDiffEditor) {
			const scrollLine = line + 4
			this.activeDiffEditor.revealRange(
				new vscode.Range(scrollLine, 0, scrollLine, 0),
				vscode.TextEditorRevealType.InCenter,
			)
		}
	}

	scrollToFirstDiff() {
		if (!this.activeDiffEditor) {
			return
		}
		const currentContent = this.activeDiffEditor.document.getText()
		const diffs = diff.diffLines(this.originalContent || "", currentContent)
		let lineCount = 0
		for (const part of diffs) {
			if (part.added || part.removed) {
				// 找到第一个差异，滚动到它
				this.activeDiffEditor.revealRange(
					new vscode.Range(lineCount, 0, lineCount, 0),
					vscode.TextEditorRevealType.InCenter,
				)
				return
			}
			if (!part.removed) {
				lineCount += part.count || 0
			}
		}
	}

	getProjectName() {
		let projectName = ""
		const workspaceFolders = vscode.workspace.workspaceFolders

		if (workspaceFolders && workspaceFolders.length > 0) {
			// 获取第一个工作区文件夹的名称
			projectName = workspaceFolders[0].name
		}
		return projectName
	}

	reportDiff(toolName: string) {
		this.currentTool = toolName
		if (!this.activeDiffEditor) {
			return
		}
		const currentContent = this.activeDiffEditor.document.getText()
		const diffs = diff.diffLines(this.originalContent || "", currentContent)
		if (!diffs.length) {
			return
		}
		let originalLines = 0
		let addedLines = 0
		let deletedLines = 0
		diffs.forEach((part) => {
			if (part.added) {
				addedLines += part.count || 0
			} else if (part.removed) {
				deletedLines += part.count || 0
				originalLines += part.count || 0
			} else {
				originalLines += part.count || 0
			}
		})
		let codeUsage: codeUsage = {
			projectName: this.getProjectName(),
			filePath: this.relPath || "",
			eventType: toolName,
			originalLines,
			addedLines,
			deletedLines,
		}
		reportCodeUsage(codeUsage)
	}

	updateDiffApprove(status: number) {
		let codeUsageUpdate: codeUsageUpdate = {
			projectName: this.getProjectName(),
			filePath: this.relPath || "",
			eventType: this.currentTool,
			status,
		}
		updateCodeUsage(codeUsageUpdate)
	}

	// 关闭编辑器（如果已打开）？
	async reset() {
		this.editType = undefined
		this.isEditing = false
		this.originalContent = undefined
		this.createdDirs = []
		this.documentWasOpen = false
		this.activeDiffEditor = undefined
		this.fadedOverlayController = undefined
		this.activeLineController = undefined
		this.streamedLines = []
		this.preDiagnostics = []
	}
}
