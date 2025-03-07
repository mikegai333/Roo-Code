import * as vscode from "vscode"
import { simpleGit, SimpleGit, CleanOptions, SimpleGitOptions } from "simple-git"
import { lintFiles, prepareExport, getLineCount, fetchAndSaveExcel, reportDianoics } from "../../lint"
const fs = require("fs")

export class GitVersionComparer {
	private git: SimpleGit
	private version1: string = "4.3.0"
	private version2: string = "4.4.0"

	constructor() {
		const options: Partial<SimpleGitOptions> = {
			baseDir: vscode.workspace.rootPath,
			binary: "git",
			maxConcurrentProcesses: 6,
			trimmed: false,
		}
		this.git = simpleGit(options)
	}

	public async compareVersions(): Promise<any> {
		const isGitRepo = await this.git.checkIsRepo()
		if (!isGitRepo) {
			return vscode.window.showErrorMessage("当前目录不是git仓库")
		}
		this.version1 = (await vscode.window.showInputBox({
			prompt: "请输入代码比对起始名称/ID (e.g., v1.0.0):",
			ignoreFocusOut: true,
		})) as string
		this.version2 = (await vscode.window.showInputBox({
			prompt: "请输入代码比对截止名称/ID (e.g., v1.1.0):",
			ignoreFocusOut: true,
		})) as string
		if (!this.version1 || !this.version2) {
			return
		}
		try {
			// 使用 SimpleGit 来获取文件变更
			const diff: any = await this.git.diffSummary([this.version1, this.version2])

			// 使用 simple-git 的 diff 输出格式
			const filesChanged = await Promise.all(
				diff.files.map(async (file: any) => {
					// 直接使用 raw 命令获取作者列表
					const authors = await this.git.raw([
						"log",
						"--no-merges",
						"--format=%an",
						`${this.version1}..${this.version2}`,
						"--",
						file.file,
					])

					// 处理作者列表
					const uniqueAuthors = [
						...new Set(
							authors
								.split("\n")
								.map((name) => name.trim())
								.filter(Boolean),
						),
					].join("|")

					// 获取最后修改时间
					const lastModifiedEntry: any = await this.getLastModifiedTime(
						file.file,
						this.version1,
						this.version2,
					)
					// console.log('lastModifiedEntry', lastModifiedEntry)

					return {
						file: file.file,
						added: file.insertions,
						removed: file.deletions,
						changed: file.changes,
						authors: uniqueAuthors,
						lastModified: lastModifiedEntry,
					}
				}),
			)
			console.log("filesChanged", filesChanged)
			return filesChanged
		} catch (error: any) {
			if (error.message.indexOf(this.version1) > -1) {
				vscode.window.showErrorMessage("源名称/ID 输入不正确")
			} else if (error.message.indexOf(this.version2) > -1) {
				vscode.window.showErrorMessage("目标名称/ID 输入不正确")
			} else {
				vscode.window.showErrorMessage(error.message)
			}
		}
	}

	private async getLastModifiedTime(filePath: any, version1: any, version2: any) {
		try {
			// 获取指定 commit 之前(包含该 commit)的文件修改记录
			const logs = await this.git.log({
				file: filePath,
				to: version2,
				from: version1,
			})
			// logs.latest 是最近的一次修改记录
			if (logs.all.length > 0) {
				let latestCommitDate = new Date(logs.all[0].date).toLocaleString("zh-CN")
				return latestCommitDate
			}

			return null
		} catch (err) {
			console.error("Error:", err)
			return null
		}
	}

	public async compareAndExport(): Promise<void> {
		// 获取当前工作目录
		const workspaceFolders = vscode.workspace.workspaceFolders
		let currentWorkspaceFolder = workspaceFolders ? workspaceFolders[0].uri.fsPath : ""
		currentWorkspaceFolder = currentWorkspaceFolder.replace(/\\/g, "/")
		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "正在执行 git 版本比对",
					cancellable: false,
				},
				async (progress) => {
					// Start the comparison and export process
					progress.report({ increment: 0, message: "执行版本比对..." })
					const compareResult = await this.compareVersions()
					compareResult.forEach((file: any) => {
						file.file = currentWorkspaceFolder + "/" + file.file
					})
					let files = compareResult.map((file: any) => file.file)
					let existingFiles = await this.filterExistingFiles(files)
					progress.report({ increment: 25, message: "计算代码行数..." })
					let { codeInfo, totalLines }: any = await getLineCount(existingFiles)

					progress.report({ increment: 50, message: "扫描代码..." })
					const scanResult: any = await lintFiles(existingFiles)
					await reportDianoics(scanResult)
					progress.report({ increment: 75, message: "导出报告..." })
					let newCodeInfo = files.map((item: any) => {
						let changeInfo = compareResult.find((item2: any) => item2.file === item)
						let fileCodeInfo = codeInfo.find((item2: any) => item2.filename === item)
						return { filename: item, ...changeInfo, ...fileCodeInfo }
					})
					// 完成后的操作
					vscode.window
						.showInformationMessage("扫描完成，是否导出代码比对清单?", "是", "否")
						.then(async (answer) => {
							if (answer === "是") {
								const report = await prepareExport(scanResult, newCodeInfo, totalLines)
								report.summary_result = {
									...report.summary_result,
									version1: this.version1,
									version2: this.version2,
									changeFileNum: compareResult.length || 0,
									compareDate: new Date().toLocaleString("zh-CN"),
								}
								console.log("report", JSON.stringify(report, null, 2))
								await fetchAndSaveExcel(report, "sh")
							} else {
							}
						})
					progress.report({ increment: 100, message: "完成" })
				},
			)
		} catch (error: any) {
			console.error(error.message)
		}
	}

	private async filterExistingFiles(files: any[]): Promise<any[]> {
		const existenceChecks = files.map((file) => this.checkFileExists(file))
		const results = await Promise.all(existenceChecks)
		return files.filter((file, index) => results[index])
	}

	private async checkFileExists(file: String) {
		try {
			await fs.promises.access(file, fs.constants.F_OK)
			return true
		} catch (err) {
			return false
		}
	}
}
