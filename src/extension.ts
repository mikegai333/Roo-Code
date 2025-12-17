import * as vscode from "vscode"
import { promises as fs } from "fs"

const EXTENSION_ID = "bocsoft.aixcoding" // 假设这是你的插件 ID

import { ClineProvider } from "./core/webview/ClineProvider"
import { createClineAPI } from "./exports"
import "./utils/path" // Necessary to have access to String.prototype.toPosix.
import { CodeActionProvider } from "./core/CodeActionProvider"
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider"
import { handleUri, registerCommands, registerCodeActions, registerTerminalActions } from "./activate"
import { McpServerManager } from "./services/mcp/McpServerManager"
import { startLinting, clearDiagnostics } from "./lint"
import { GitVersionComparer } from "./extension/providers/gitVersionConpare"

let myStatusBarItem: vscode.StatusBarItem
import * as os from "os"
import { CompletionProvider, NesCompletionInfo, DiagnosticsCompletionInfo } from "./extension/providers/completion"
import { TemplateProvider } from "./extension/template-provider"
import { ServerMessage } from "./common/types"
import { FileInteractionCache } from "./extension/file-interaction"
import { getLineBreakCount } from "./webview/utils"
import path from "path"
import { delayExecution } from "./extension/utils"
import { initializeConfiguration } from "./api/aixcoding"
import { VsCodeIde } from "./extension/util/VsCodeIde"
import { DiagnosticCompletionItem } from "./copilot/extension/inlineEdits/vscode-node/features/diagnosticsBasedCompletions/diagnosticsCompletions"
import { VSCodeWorkspace } from "./copilot/extension/inlineEdits/vscode-node/parts/vscodeWorkspace"
import { DiagnosticsNextEditProvider } from "./copilot/extension/inlineEdits/vscode-node/features/diagnosticsInlineEditProvider"
import { GitExtensionServiceImpl } from "./copilot/platform/git/vscode/gitExtensionServiceImpl"
import { IGitExtensionService } from "./copilot/platform/git/common/gitExtensionService"
import { IInstantiationService } from "./copilot/util/vs/platform/instantiation/common/instantiation"
import { InstantiationService } from "./copilot/util/vs/platform/instantiation/common/instantiationService"
import { ServiceCollection } from "./copilot/util/vs/platform/instantiation/common/serviceCollection"
import { IWorkspaceService } from "./copilot/platform/workspace/common/workspaceService"
import { ExtensionTextDocumentManager } from "./copilot/platform/workspace/vscode/workspaceServiceImpl"
import { ILogService, LogLevel, LogServiceImpl } from "./copilot/platform/log/common/logService"
import { NewOutputChannelLogTarget } from "./copilot/platform/log/vscode/outputChannelLogTarget"
import {
	IRemoteRepositoriesService,
	RemoteRepositoriesService,
} from "./copilot/platform/remoteRepositories/vscode/remoteRepositories"
import { ObservableGit } from "./copilot/platform/inlineEdits/common/observableGit"
import { IFileSystemService } from "./copilot/platform/filesystem/common/fileSystemService"
import { VSCodeFileSystemService } from "./copilot/platform/filesystem/vscode/fileSystemServiceImpl"
import { ITabsAndEditorsService } from "./copilot/platform/tabs/common/tabsAndEditorsService"
import { TabsAndEditorsServiceImpl } from "./copilot/platform/tabs/vscode/tabsAndEditorsServiceImpl"
import { ILanguageDiagnosticsService } from "./copilot/platform/languages/common/languageDiagnosticsService"
import { LanguageDiagnosticsServiceImpl } from "./copilot/platform/languages/vscode/languageDiagnosticsServiceImpl"
import { SyncDescriptor } from "./copilot/util/vs/platform/instantiation/common/descriptors"

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export function activate(context: vscode.ExtensionContext) {
	const services = new ServiceCollection()
	const instantiationService = new InstantiationService(services, true)
	services.set(IInstantiationService, instantiationService)
	services.set(ILogService, new LogServiceImpl([new NewOutputChannelLogTarget(context)]))
	services.set(IRemoteRepositoriesService, new RemoteRepositoriesService())
	services.set(IGitExtensionService, instantiationService.createInstance(GitExtensionServiceImpl))
	services.set(IWorkspaceService, instantiationService.createInstance(ExtensionTextDocumentManager))
	services.set(IFileSystemService, new VSCodeFileSystemService())
	services.set(ITabsAndEditorsService, new TabsAndEditorsServiceImpl())
	services.set(ILanguageDiagnosticsService, new SyncDescriptor(LanguageDiagnosticsServiceImpl))
	initializeConfiguration(context)
	vscode.commands.executeCommand("setContext", "newVersion", context.globalState.get("mode") !== "ask")
	extensionContext = context
	outputChannel = vscode.window.createOutputChannel("AIxCoding")
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine("AIxCoding extension activated")

	// 你的插件ID

	// 一个标志，防止在同一次会话中重复执行修改操作
	// let hasAttemptedModification = false;

	// if (!hasAttemptedModification) {
	// 	hasAttemptedModification = true;
	// 	// 将 context 传入
	// 	configureProposedApi(context);
	// }

	/**
	 * 定位、读取、修改并写回 argv.json 文件
	 * @param context 扩展上下文
	 */
	async function configureProposedApi(context: vscode.ExtensionContext) {
		let argvPath: string | undefined

		try {
			// 从 context.globalStorageUri 推导用户数据目录
			// 这比直接使用 vscode.env.appUserDataPath 更稳定，可以避免类型定义问题
			const userDataPath = path.join(context.globalStorageUri.fsPath, "..", "..")

			// 定义 argv.json 的可能位置
			const potentialPaths: string[] = [
				// 用户提供的直接路径
				path.join(os.homedir(), ".vscode", "argv.json"),
				// 标准安装 (从 globalStorageUri 推断)
				path.join(userDataPath, "argv.json"),
				// Portable 模式 (这是一个常见的猜测)
				path.join(path.dirname(vscode.env.appRoot), "argv.json"),
				// 开发环境
				path.join(vscode.env.appRoot, "argv.json"),
			]

			// 寻找存在的 argv.json
			for (const p of potentialPaths) {
				try {
					await fs.access(p)
					argvPath = p
					break
				} catch (error) {
					// 文件不存在，继续寻找
				}
			}

			if (!argvPath) {
				// 如果所有已知位置都找不到，则回退到默认创建路径
				// 这是一个兜底策略，可能不总是成功
				argvPath = path.join(userDataPath, "argv.json")
				console.log(`在已知位置未找到 argv.json, 将尝试在默认位置创建: ${argvPath}`)
			} else {
				console.log(`找到 argv.json 位于: ${argvPath}`)
			}

			let config: any = {}
			let originalContent = ""
			let fileExists = false

			// 1. 读取文件
			try {
				originalContent = await fs.readFile(argvPath, "utf-8")
				fileExists = true
			} catch (error: any) {
				if (error.code === "ENOENT") {
					// 文件不存在，这是正常情况，我们将创建一个新的
					console.log("argv.json not found. A new one will be created.")
				} else {
					// 其他读取错误（如权限问题），直接抛出，终止操作
					throw new Error(`读取 argv.json 失败: ${error.message}`)
				}
			}

			// 2. 解析 JSON
			if (fileExists) {
				try {
					// 使用更宽松的解析方式，处理注释和尾随逗号
					// 注意：Node.js 原生 JSON.parse 不支持注释，如果文件有注释，会解析失败。
					// 这是一个巨大的风险点。一个简单的解决方法是先移除注释。
					const contentWithoutComments = originalContent
						.replace(/\/\/.*/g, "")
						.replace(/\/\*[\s\S]*?\*\//g, "")
					config = JSON.parse(contentWithoutComments)
				} catch (error) {
					// 如果解析失败，说明文件已损坏。此时绝不能覆盖它。
					console.error("无法解析 argv.json 文件，可能格式已损坏。操作已取消。", error)
					vscode.window.showErrorMessage(`您的 argv.json 文件格式有误，插件无法自动配置。请手动修复后重试。`)
					return // 终止操作
				}
			}

			// 3. 修改配置
			let needsWrite = false
			const proposedApiKey = "enable-proposed-api"

			if (!config[proposedApiKey]) {
				config[proposedApiKey] = []
				needsWrite = true
			}

			if (!Array.isArray(config[proposedApiKey])) {
				// 如果 enable-proposed-api 存在但不是数组，这是一个错误状态。
				// 最安全的做法是报错并停止，而不是覆盖它。
				console.error(`argv.json 中的 "enable-proposed-api" 不是一个数组。操作已取消。`)
				vscode.window.showErrorMessage(
					`您的 argv.json 文件配置有误 ("enable-proposed-api" 不是数组)，插件无法自动配置。`,
				)
				return
			}

			if (!config[proposedApiKey].includes(EXTENSION_ID)) {
				config[proposedApiKey].push(EXTENSION_ID)
				needsWrite = true
			}

			// 4. 如果需要，则写回文件
			if (needsWrite) {
				try {
					const newContent = JSON.stringify(config, null, 2) // 格式化输出，方便人类阅读
					await fs.writeFile(argvPath, newContent, "utf-8")
					console.log(`成功将 "${EXTENSION_ID}" 添加到 argv.json 的 "enable-proposed-api" 中。`)

					// 5. 提示用户重启
					// 这是至关重要的一步！
					const restartAction = "立即重启 VS Code"
					vscode.window
						.showInformationMessage(
							`插件 "${EXTENSION_ID}" 已为您自动配置 Proposed API。请重启 VS Code 以使设置生效。`,
							restartAction,
						)
						.then((selection) => {
							if (selection === restartAction) {
								vscode.commands.executeCommand("workbench.action.quit")
							}
						})
				} catch (error: any) {
					// 写入失败，可能是权限问题
					console.error(`写入 argv.json 失败:`, error)
					vscode.window.showErrorMessage(`自动配置失败：无法写入 argv.json 文件。请检查文件权限或手动配置。`)
				}
			} else {
				console.log(`argv.json 中已存在 "${EXTENSION_ID}" 的配置，无需修改。`)
			}
		} catch (error: any) {
			console.error("自动配置 Proposed API 时发生严重错误:", error)
			vscode.window.showErrorMessage(`插件自动配置时发生错误: ${error.message}`)
		}
	}

	// Get default commands from configuration.
	const defaultCommands = vscode.workspace.getConfiguration("aixcoding").get<string[]>("allowedCommands") || []

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
	}
	if (context.globalState.get("enableCompletion") === undefined) {
		context.globalState.update("enableCompletion", false)
	}

	const sidebarProvider = new ClineProvider(context, outputChannel)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, sidebarProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	registerCommands({ context, outputChannel, provider: sidebarProvider })

	/**
	 * We use the text document content provider API to show the left side for diff
	 * view by creating a virtual document for the original content. This makes it
	 * readonly so users know to edit the right side if they want to keep their changes.
	 *
	 * This API allows you to create readonly documents in VSCode from arbitrary
	 * sources, and works by claiming an uri-scheme for which your provider then
	 * returns text contents. The scheme must be provided when registering a
	 * provider and cannot change afterwards.
	 *
	 * Note how the provider doesn't create uris for virtual documents - its role
	 * is to provide contents given such an uri. In return, content providers are
	 * wired into the open document logic so that providers are always considered.
	 *
	 * https://code.visualstudio.com/api/extension-guides/virtual-documents
	 */
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider),
	)

	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }))

	// 定义白名单语言 ID
	const WHITELISTED_LANGUAGES = [
		"java",
		"javascript",
		"python",
		"shellscript",
		"sql",
		"xml",
		"vue",
		"html",
		"cpp",
		"json",
		"css",
		"typescript",
		"typescriptreact",
		"c",
		"go",
	]
	const documentSelector: vscode.DocumentSelector = WHITELISTED_LANGUAGES.map((lang) => ({
		language: lang,
		scheme: "file", // 你也可以添加 'untitled' 来支持未保存的文件
	}))

	// Register code actions provider.
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: "**/*" }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
		}),
	)

	registerCodeActions(context)
	registerTerminalActions(context)

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
	const templateDir = path.join(os.homedir(), ".aixcoding/templates") as string
	const templateProvider = new TemplateProvider(templateDir)
	const fileInteractionCache = new FileInteractionCache()
	const ide = new VsCodeIde(context)
	vscode.workspace.onDidSaveTextDocument(async (event) => {
		ide.updateLastFileSaveTimestamp()
		// this.core.invoke("files/changed", {
		//   uris: [event.uri.toString()],
		// });
	})
	const workspace = instantiationService.createInstance(VSCodeWorkspace)
	const git = instantiationService.createInstance(ObservableGit)
	const diagnosticsCompletions = instantiationService.createInstance(DiagnosticsNextEditProvider, workspace, git)
	const completionProvider = new CompletionProvider(
		statusBar,
		fileInteractionCache,
		templateProvider,
		context,
		ide,
		diagnosticsCompletions,
		workspace,
	)
	templateProvider.init()
	statusBar.text = "AIxCoding"
	statusBar.command = "aixcoding.toggleCompletion"
	updateStatusBar()
	statusBar.show()
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider(documentSelector, completionProvider, {
			displayName: "aixcoding",
			yieldTo: undefined,
		}),
	)

	// 停止补全代码
	const stopCompletion = vscode.commands.registerCommand("aixcoding.stopCompletion", () => {
		completionProvider.abortCompletion()
	})

	// 禁用/开启代码补全
	const toggleCompletion = vscode.commands.registerCommand("aixcoding.toggleCompletion", async () => {
		const currentState = context.globalState.get("enableCompletion", false)
		completionProvider.abortCompletion()
		await context.globalState.update("enableCompletion", !currentState)
		completionProvider.updateConfig()
		updateStatusBar()
	})

	vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration("enableCompletion")) {
			updateStatusBar()
		}
	})

	function updateStatusBar() {
		const isCompletionEnabled = context.globalState.get("enableCompletion", false)
		statusBar.text = `${isCompletionEnabled ? "$(check)" : "$(circle-slash)"} AI×Coding`
		statusBar.tooltip = isCompletionEnabled ? "禁用代码补全" : "开启代码补全"
		statusBar.backgroundColor = new vscode.ThemeColor(
			isCompletionEnabled ? "statusBarItem.background" : "statusBarItem.warningBackground",
		)
	}

	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			const filePath = document.uri.fsPath
			fileInteractionCache.endSession()
			fileInteractionCache.delete(filePath)
		}),
		vscode.workspace.onDidOpenTextDocument((document) => {
			const filePath = document.uri.fsPath
			fileInteractionCache.startSession(filePath)
			fileInteractionCache.incrementVisits()
		}),
		vscode.workspace.onDidChangeTextDocument((e) => {
			const changes = e.contentChanges[0]
			if (!changes) return
			const currentLine = changes.range.start.line
			const currentCharacter = changes.range.start.character
			fileInteractionCache.incrementStrokes(currentLine, currentCharacter)
		}),
	)

	// 扫描选中的文件
	const lintSelected = vscode.commands.registerCommand(
		"aixcoding.lintSelected",
		async (currentFile, selectedFiles) => {
			startLinting(
				"1",
				selectedFiles.map((file: { fsPath: any }) => file.fsPath),
			)
		},
	)
	// 扫描当前文件
	const lintCurrent = vscode.commands.registerCommand("aixcoding.lintCurrent", async (currentFile) => {
		startLinting("2", currentFile.fsPath)
	})
	// 扫描整个工程
	const lintProject = vscode.commands.registerCommand("aixcoding.lintProject", async () => {
		startLinting("0", null)
	})
	// 清空所有问题
	const clearProblems = vscode.commands.registerCommand("aixcoding.clearDiagnostics", async () => {
		clearDiagnostics()
	})

	// 执行 git 版本比较
	const gitVersionCompare = vscode.commands.registerCommand("aixcoding.gitVersionCompare", async () => {
		let gitVersionComparer = new GitVersionComparer()
		gitVersionComparer.compareAndExport()
	})

	context.subscriptions.push(
		lintSelected,
		lintCurrent,
		lintProject,
		clearProblems,
		stopCompletion,
		toggleCompletion,
		gitVersionCompare,
	)
	return createClineAPI(outputChannel, sidebarProvider)
}

// This method is called when your extension is deactivated
export async function deactivate() {
	outputChannel.appendLine("AIxCoding extension deactivated")
	// Clean up MCP server manager
	await McpServerManager.cleanup(extensionContext)
}
