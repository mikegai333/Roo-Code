import * as vscode from "vscode"

import { ACTION_NAMES, COMMAND_IDS } from "../core/CodeActionProvider" // 代码动作提供程序中的动作名称和命令 ID
import { EditorUtils } from "../core/EditorUtils" // 编辑器工具类
import { ClineProvider } from "../core/webview/ClineProvider" // Cline 提供程序

export const registerCodeActions = (context: vscode.ExtensionContext) => {
	registerCodeActionPair(
		context,
		COMMAND_IDS.EXPLAIN, // 解释命令 ID
		"EXPLAIN", // 解释动作类型
		"你想让 AIxCoding 解释什么？", // 输入提示：你想让 AIxCoding 解释什么？
		"例如：错误处理是如何工作的？", // 输入占位符：例如：错误处理是如何工作的？
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.FIX, // 修复命令 ID
		"FIX", // 修复动作类型
		"你想让 AIxCoding 修复什么？", // 输入提示：你想让 AIxCoding 修复什么？
		"例如：保持向后兼容性", // 输入占位符：例如：保持向后兼容性
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.IMPROVE, // 优化命令 ID
		"IMPROVE", // 优化动作类型
		"你想让 AIxCoding 优化什么？", // 输入提示：你想让 AIxCoding 优化什么？
		"例如：关注性能优化", // 输入占位符：例如：关注性能优化
	)

	registerCodeAction(context, COMMAND_IDS.ADD_TO_CONTEXT, "ADD_TO_CONTEXT") // 添加到上下文命令
}

const registerCodeAction = (
	context: vscode.ExtensionContext,
	command: string, // 命令字符串
	promptType: keyof typeof ACTION_NAMES, // 提示类型
	inputPrompt?: string, // 输入提示
	inputPlaceholder?: string, // 输入占位符
) => {
	let userInput: string | undefined // 用户输入

	context.subscriptions.push(
		vscode.commands.registerCommand(command, async (...args: any[]) => {
			if (inputPrompt) {
				userInput = await vscode.window.showInputBox({
					prompt: inputPrompt, // 输入提示
					placeHolder: inputPlaceholder, // 输入占位符
				})
				if (userInput === undefined) return // 按下 Esc 键时，userInput 为 undefined，直接返回
			}

			// 处理代码动作和直接命令的情况。
			let filePath: string // 文件路径
			let selectedText: string // 选中的文本
			let diagnostics: any[] | undefined // 诊断信息

			if (args.length > 1) {
				// 来自代码动作。
				;[filePath, selectedText, diagnostics] = args
			} else {
				// 来自命令面板。
				const context = EditorUtils.getEditorContext()
				if (!context) return
				;({ filePath, selectedText, diagnostics } = context)
			}

			const params = {
				...{ filePath, selectedText }, // 文件路径和选中文本
				...(diagnostics ? { diagnostics } : {}), // 诊断信息（如果存在）
				...(userInput ? { userInput } : {}), // 用户输入（如果存在）
			}

			await ClineProvider.handleCodeAction(command, promptType, params) // 处理代码动作
		}),
	)
}

const registerCodeActionPair = (
	context: vscode.ExtensionContext,
	baseCommand: string, // 基础命令
	promptType: keyof typeof ACTION_NAMES, // 提示类型
	inputPrompt?: string, // 输入提示
	inputPlaceholder?: string, // 输入占位符
) => {
	// 注册新任务版本。
	registerCodeAction(context, baseCommand, promptType, inputPrompt, inputPlaceholder)

	// 注册当前任务版本。
	registerCodeAction(context, `${baseCommand}InCurrentTask`, promptType, inputPrompt, inputPlaceholder)
}
