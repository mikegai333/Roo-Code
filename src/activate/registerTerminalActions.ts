import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { TerminalManager } from "../integrations/terminal/TerminalManager"

const TERMINAL_COMMAND_IDS = {
	ADD_TO_CONTEXT: "aixcoding.terminalAddToContext", // 添加到上下文命令 ID
	FIX: "aixcoding.terminalFixCommand", // 终端修复命令 ID
	FIX_IN_CURRENT_TASK: "aixcoding.terminalFixCommandInCurrentTask", // 在当前任务中修复命令 ID
	EXPLAIN: "aixcoding.terminalExplainCommand", // 终端解释命令 ID
	EXPLAIN_IN_CURRENT_TASK: "aixcoding.terminalExplainCommandInCurrentTask", // 在当前任务中解释命令 ID
} as const

export const registerTerminalActions = (context: vscode.ExtensionContext) => {
	const terminalManager = new TerminalManager()

	registerTerminalAction(context, terminalManager, TERMINAL_COMMAND_IDS.ADD_TO_CONTEXT, "TERMINAL_ADD_TO_CONTEXT") // 注册添加到上下文终端操作

	registerTerminalActionPair(
		context,
		terminalManager,
		TERMINAL_COMMAND_IDS.FIX, // 终端修复命令 ID
		"TERMINAL_FIX", // 终端修复操作类型
		"你想让 AIxCoding 修复什么？", // 输入提示：你想让 AIxCoding 修复什么？
	)

	registerTerminalActionPair(
		context,
		terminalManager,
		TERMINAL_COMMAND_IDS.EXPLAIN, // 终端解释命令 ID
		"TERMINAL_EXPLAIN", // 终端解释操作类型
		"你想让 AIxCoding 解释什么？", // 输入提示：你想让 AIxCoding 解释什么？
	)
}

const registerTerminalAction = (
	context: vscode.ExtensionContext,
	terminalManager: TerminalManager,
	command: string, // 命令字符串
	promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN", // 提示类型
	inputPrompt?: string, // 输入提示
) => {
	context.subscriptions.push(
		vscode.commands.registerCommand(command, async (args: any) => {
			let content = args.selection // 获取选中的内容
			if (!content || content === "") {
				content = await terminalManager.getTerminalContents(promptType === "TERMINAL_ADD_TO_CONTEXT" ? -1 : 1) // 获取终端内容
			}

			if (!content) {
				vscode.window.showWarningMessage("没有选中终端内容") // 显示警告信息
				return
			}

			const params: Record<string, any> = {
				terminalContent: content, // 终端内容
			}

			if (inputPrompt) {
				params.userInput = await vscode.window.showInputBox({
					prompt: inputPrompt, // 输入提示
				}) // 获取用户输入
				if (params.userInput === undefined) return // 按下 Esc 键时，params.userInput 为空字符串，直接返回
			}

			await ClineProvider.handleTerminalAction(command, promptType, params) // 处理终端操作
		}),
	)
}

const registerTerminalActionPair = (
	context: vscode.ExtensionContext,
	terminalManager: TerminalManager,
	baseCommand: string, // 基础命令
	promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN", // 提示类型
	inputPrompt?: string, // 输入提示
) => {
	// 注册新任务版本
	registerTerminalAction(context, terminalManager, baseCommand, promptType, inputPrompt)
	// 注册当前任务版本
	registerTerminalAction(context, terminalManager, `${baseCommand}InCurrentTask`, promptType, inputPrompt)
}
