import * as vscode from "vscode"
import { ApiConfiguration } from "./shared/api"
import * as os from "os"
import * as fs from "fs"
import path from "path"
import axios, { AxiosResponse } from "axios"
// @ts-ignore
import aixcoding from "../config/eslint-plugin-aixcoding"
// @ts-ignore
import vuePlugin from "../config/eslint-plugin-vue"

// 获取当前工作目录
const workspaceFolders = vscode.workspace.workspaceFolders
const currentWorkspaceFolder = workspaceFolders ? workspaceFolders[0].uri.fsPath : undefined
const collection = vscode.languages.createDiagnosticCollection("AIxCoding")
// 扩展程序运行目录
const extensionDir = process.cwd()
const { ESLint } = require("eslint")
let filePattern: any
let scanType: string
let codeInfo: any = []
let totalLines: number = 0
let scanResult: any = []
let projectToken: string = ""
let productName: string = ""
let batchName: string = ""
let eslintConfig: any = {}
let eslintVersion: string = ""
let apiConfiguration: ApiConfiguration | undefined

export async function getConfig() {
	const extension = vscode.extensions.getExtension("bocsoft.aixcoding")
	const clineProvider = extension?.exports
	if (!extension) {
		console.error("bocsoft.aixcoding extension not found")
		return
	}
	if (!clineProvider) {
		console.error("clineProvider is undefined")
		return
	}
	// clineProvider is ClineAPI, which does not have getState method
	// Access sidebarProvider from clineProvider to get ClineProvider instance
	const sidebarProvider = clineProvider.sidebarProvider
	const state = await sidebarProvider.getState()
	console.log("state", state)
	return state
}

export function lintFiles(filePattern: any) {
	return new Promise(async (resolve, reject) => {
		try {
			const eslint = new ESLint({
				useEslintrc: false,
				overrideConfigFile: path.join(__dirname, "..", "eslintrc.js"),
				plugins: {
					aixcoding, // 确保这个路径是正确的
					vue: vuePlugin,
				},
				extensions: [".js", ".vue"],
			})
			// 执行 eslint 扫描
			scanResult = await eslint.lintFiles(filePattern)
			scanResult = scanResult.filter((item: { messages: any[] }) => {
				return !item.messages.find((message) => !message.ruleId)
			})
			resolve(scanResult)
		} catch (error) {
			process.exitCode = 1
			console.error(error)
			reject(error)
		}
	})
}
export async function startLinting(range: string, customFilePattern: any) {
	try {
		scanType = range
		collection.clear()
		const eslint = new ESLint({
			useEslintrc: false,
			overrideConfigFile: path.join(__dirname, "..", "eslintrc.js"),
			plugins: {
				aixcoding, // 从指定路径加载
				vue: vuePlugin,
			},
			extensions: [".js", ".vue"],
			// resolvePluginsRelativeTo: path.join(__dirname, '../'), // 假设插件安装在项目根目录的 node_modules 中
		})

		if (range === "0") {
			// 整个项目
			filePattern = currentWorkspaceFolder
		} else if (range === "1") {
			// 选择的文件
			filePattern = customFilePattern
		} else if (range === "2") {
			// 当前文件
			filePattern = customFilePattern
		}

		console.log("customFilePattern", customFilePattern)
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "扫描和统计代码行数",
				cancellable: false,
			},
			async (progress, token) => {
				token.onCancellationRequested(() => {
					// 这里可以添加取消操作的处理逻辑，比如中断 eslint 或 getLineCount
				})

				progress.report({ message: "处理中..." })

				try {
					console.log("filePattern", filePattern)
					// 执行 eslint 扫描
					scanResult = await eslint.lintFiles(filePattern)
					// scanResult.forEach((item: { messages: any[]; })=>{
					//     item.messages = item.messages.filter((message: { ruleId: any; })=>message.ruleId)
					// })
					scanResult = scanResult.filter((item: { messages: any[] }) => {
						return !item.messages.find((message) => !message.ruleId)
					})
					console.log("results", scanResult)
					if (!scanResult || scanResult.length === 0) {
						vscode.window.showWarningMessage("所选文件被扫描器默认忽略，如需检查请重新选择扫描范围。")
						return
					}
					// 统计代码行数
					const fileList = scanResult.map((item: { filePath: any }) => item.filePath)
					await getLineCount(fileList)
					await getVersion()

					productName = (await vscode.window.showInputBox({ prompt: "请输入产品英文简称" })) || ""
					batchName = (await vscode.window.showInputBox({ prompt: "请输入产品批次" })) || ""
					projectToken = `${productName}|${batchName}`
					await reportDianoics(scanResult)
					// 在问题面板中显示扫描结果信息
					// const diagnosticCollection = vscode.languages.createDiagnosticCollection('eslint');

					scanResult.forEach((result: { filePath: string; messages: any[] }) => {
						const diagnostics: vscode.Diagnostic[] | undefined = []

						// 获取文件路径
						const uri = vscode.Uri.file(result.filePath)

						// 遍历所有消息，创建诊断信息
						result.messages.forEach(
							(message: {
								line: number
								column: number
								endLine: number
								endColumn: number
								severity: number
								message: string
							}) => {
								const range = new vscode.Range(
									new vscode.Position(message.line - 1, message.column - 1),
									new vscode.Position(message.endLine - 1, message.endColumn - 1),
								)
								const severity =
									message.severity === 1
										? vscode.DiagnosticSeverity.Warning
										: vscode.DiagnosticSeverity.Error
								const diagnostic = new vscode.Diagnostic(range, `${message.message}`, severity)
								diagnostic.source = "AI×Coding"
								diagnostics.push(diagnostic)
							},
						)

						// 将诊断信息关联到文件
						collection.set(uri, diagnostics)
					})

					// 完成后的操作
					vscode.window
						.showInformationMessage("扫描完成，是否导出问题记录单?", "是", "否")
						.then(async (answer) => {
							if (answer === "是") {
								let report = await prepareExport(scanResult, codeInfo, totalLines)
								await fetchAndSaveExcel(report, "hq")
							} else {
								// 如果用户选择“否”，可以在这里处理相应的逻辑
							}
						})
				} catch (error: any) {
					vscode.window.showErrorMessage("处理过程中发生错误: " + error.message)
				}
			},
		)
	} catch (error) {
		process.exitCode = 1
		console.error(error)
	}
}

export function clearDiagnostics() {
	collection.clear()
}

export function disposeDiagnostics() {
	collection.clear()
	collection.dispose()
}

// 上送扫描结果
export async function reportDianoics(results: any) {
	const configuration = await getConfig()
	console.log("aixcoding", configuration)
	let apiKey = configuration?.apiConfiguration?.openAiApiKey as string
	const apiBaseUrl = configuration.baseApi as string
	const extension = vscode.extensions.getExtension("bocsoft.aixcoding")
	const version = extension?.packageJSON.version
	const url = apiBaseUrl + "/api/v2/report/scan"
	const userName = os.userInfo().username
	const workspaceName = vscode.workspace.name
	const workspaceFolders = vscode.workspace.workspaceFolders
	const currentWorkspaceFolder = workspaceFolders ? workspaceFolders[0].uri.fsPath : undefined
	const errorCount = results.reduce((acc: any, cur: any) => {
		return acc + (cur.fatalErrorCount || 0) + (cur.errorCount || 0)
	}, 0)
	const warningCount = results.reduce((acc: any, cur: any) => {
		return acc + (cur.warningCount || 0)
	}, 0)
	let violationList: any[] = []
	results.forEach((item: any) => {
		const violations = item.messages.map((message: any) => {
			return {
				eslintRule: {
					name: message.ruleId, // 如 "no-unused-vars"
					priority: message.severity, // 看eslint怎么表示的 好像是error那一套
				},
				message: message.message,
				file: item.filePath,
				position: {
					beginLine: message.line,
					endLine: message.endLine,
					beginColumn: message.column,
					endColumn: message.endColumn,
				},
			}
		})
		violationList.push(...violations)
	})
	const eslint = new ESLint({
		useEslintrc: false,
		overrideConfigFile: path.join(__dirname, "..", "eslintrc.js"),
		plugins: {
			aixcoding, // 确保这个路径是正确的
			vue: vuePlugin,
		},
		extensions: [".js", ".vue"],
	})
	// 获取配置文件
	eslintConfig = await eslint.calculateConfigForFile("../eslintrc.js")
	const ruleList = Object.keys(eslintConfig.rules)
	const { revision, branch, remote } = await getGitInfo()
	const violationObj = {
		token: apiKey,
		version: version,
		name: userName,
		ideName: "VS Code",
		ideVersion: version,
		projectName: workspaceName,
		projectPath: currentWorkspaceFolder,
		productName: productName, // 导出报告手动输入的信息 产品名称
		productionBatch: batchName, // 导出报告手动输入的信息 批次信息
		violationInfo: {
			totalCount: errorCount + warningCount,
			errorCount: errorCount,
			warningCount: warningCount,
			infoCount: 0,
			scannedLines: totalLines,
		},
		violationList: violationList,
		ruleList: ruleList,
		gitInfo: {
			gitRevision: revision, // 当前所属提交hash
			gitBranch: branch, // 当前所属分支
			gitRemote: remote, // 当前所属远程仓库地址
		},
	}
	axios
		.post(url, violationObj)
		.then((response: { data: any }) => {
			console.log("Response:", response.data)
		})
		.catch((error: any) => {
			console.error("报送扫描结果出现错误:", error)
		})
}

// 计算代码行数
export async function getLineCount(fileList: any) {
	console.log("开始计算代码行数")
	let totalLines = 0
	codeInfo = []
	return new Promise<any>((resolve, reject) => {
		try {
			fileList.forEach((filePath: any) => {
				filePath = filePath.replace(/\\/g, "/")
				const content = fs.readFileSync(filePath, "utf8")
				codeInfo.push({
					filename: filePath,
					line_count: content.split("\n").length,
				})
				totalLines += content.split("\n").length
			})
			console.log("codeInfo", codeInfo)
			// vscode.window.showInformationMessage(`Total lines in the project: ${totalLines}`);
			totalLines = totalLines
			resolve({ codeInfo, totalLines })
		} catch (e) {
			console.log(e)
			reject(e)
		}
	})
}

// 扫描结果导出报文体
export async function prepareExport(scanResult: any, codeInfo: any, totalLines: any): Promise<any> {
	const scanFileCount = scanResult.length
	const violationsCount = scanResult.reduce((a: any, b: { messages: string | any[] }) => a + b.messages.length, 0)
	const eslintVersion = await getVersion()
	const scanFiles = scanResult.map((item: any) => {
		let violations = item.messages.map((v: any) => {
			return {
				beginline: v.line,
				begincolumn: v.column,
				endline: v.endLine,
				endcolumn: v.endColumn,
				description: v.message,
				rule: v.ruleId,
				ruleset: "AIxCoding - 前端代码复查规则集",
				priority: v.severity === 1 ? "2" : "1",
				code_detail: [
					{
						line_seq: v.line,
						code_line: "",
						commit_hash: "",
					},
				],
			}
		})
		return {
			filename: item.filePath,
			violations: violations,
		}
	})
	let scanReport = {
		project_token: projectToken,
		pipeline: {
			id: "",
			name: null,
			description: null,
			build_id: "",
		},
		summary_result: {
			scan_file_count: scanFileCount,
			scan_line_count: totalLines,
			violations_count: violationsCount,
			priority_summary_list: [],
		},
		code_info: codeInfo,
		scan_result: {
			formatVersion: 0,
			pmdVersion: eslintVersion,
			timestamp: new Date().toISOString(),
			files: scanFiles,
		},
	}
	return scanReport
}

// 导出扫描结果
// 异步函数，用于请求并保存 Excel 文件

export async function fetchAndSaveExcel(report: any, type: string): Promise<void> {
	try {
		// 获取配置中的 API 基础 URL
		const config = await getConfig()
		const scanUrl = config.reportApi
		if (!scanUrl) {
			vscode.window.showErrorMessage("请配置获取扫描报告的地址")
			return
		}

		// 发送 POST 请求并获取响应
		const response = await axios({
			method: "post",
			url: `${scanUrl}/aicoding/api/v1/productManage/report/reportToExcel/${type}`,
			responseType: "arraybuffer", // 用于处理二进制数据
			data: report,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/vnd.ms-excel",
			},
		})

		// 确保至少有一个工作区目录
		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			vscode.window.showErrorMessage("没有可用的工作区目录用于存放文件")
			return
		}

		// 从响应头中提取文件名
		const contentDisposition = response.headers["content-disposition"]
		let filename = "代码复查记录单.xlsx" // 默认文件名
		if (contentDisposition) {
			const filenameRegex = /filename=([^;]+)/i
			const matches = filenameRegex.exec(contentDisposition)
			if (matches && matches[1]) {
				// 解码百分比编码的 UTF-8 文件名
				filename = decodeURIComponent(matches[1])
			}
		}

		// 获取工作区根目录路径
		const folder = vscode.workspace.workspaceFolders[0]
		const outputPath = vscode.Uri.joinPath(folder.uri, filename).fsPath

		// 确保输出路径目录存在
		const directoryPath = path.dirname(outputPath)
		if (!fs.existsSync(directoryPath)) {
			fs.mkdirSync(directoryPath, { recursive: true })
		}

		// 将接收到的 Excel 文件写入磁盘
		fs.writeFileSync(outputPath, response.data)
		vscode.window.showInformationMessage(`文件已保存至 ${outputPath}`)
	} catch (error: any) {
		console.error("下载 Excel 文件时发生错误:", error)
		vscode.window.showErrorMessage(`下载 Excel 文件时发生错误: ${error.message}`)
	}
}

// 判断一个路径是文件还是文件夹
function checkPath(path: string): Promise<string | null> {
	return new Promise((resolve, reject) => {
		fs.stat(path, (err: NodeJS.ErrnoException | null, stats: fs.Stats) => {
			if (err) {
				console.error("An error occurred:", err)
				resolve(null)
				return
			}

			if (stats.isFile()) {
				resolve("file")
			} else if (stats.isDirectory()) {
				resolve("directory")
			} else {
				resolve(null)
			}
		})
	})
}

// 获取项目 git 信息
async function getGitInfo(): Promise<{ revision: string; branch: string; remote: string }> {
	const gitExtension = vscode.extensions.getExtension("vscode.git")
	if (!gitExtension) {
		return { revision: "", branch: "", remote: "" }
	}

	await gitExtension.activate()
	const git = gitExtension.exports.getAPI(1)
	const repository = git.repositories[0] // 获取第一个仓库，如果有多个仓库，您需要选择正确的仓库

	if (!repository) {
		return { revision: "", branch: "", remote: "" }
	}

	const branch = repository.state.HEAD.name
	const revision = repository.state.HEAD.commit
	const remote = repository.state.remotes[0].fetchUrl

	return { revision, branch, remote }
}
// 获取当前工作区项目中 eslint 的版本
function getVersion(): String {
	return "8.57.0"
	// return new Promise<string>((resolve, reject) => {
	//     if (workspaceFolders && workspaceFolders.length > 0) {
	//         const workspacePath = workspaceFolders[0].uri.fsPath;
	//         const eslintPackageJsonPath = path.join(workspacePath, 'node_modules', 'eslint', 'package.json');
	//         fs.readFile(eslintPackageJsonPath, 'utf8', (err, data) => {
	//             if (err) {
	//                 resolve('');
	//             }

	//             try {
	//                 const packageJson = JSON.parse(data);
	//                 const eslintVersion = packageJson.version; // 直接获取版本号

	//                 if (eslintVersion) {
	//                     resolve(eslintVersion);
	//                 } else {
	//                     resolve('');
	//                 }
	//             } catch (e) {
	//                 resolve('');
	//             }
	//         });
	//     } else {
	//         resolve('');
	//     }
	// });
}
