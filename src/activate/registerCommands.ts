import * as vscode from "vscode"
import delay from "delay"

import { ClineProvider } from "../core/webview/ClineProvider"

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context, outputChannel } = options

	for (const [command, callback] of Object.entries(getCommandsMap(options))) {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions) => {
	return {
		"aixcoding-agent.plusButtonClicked": async () => {
			await provider.clearTask()
			await provider.postStateToWebview()
			await provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		},
		"aixcoding-agent.mcpButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
		},
		"aixcoding-agent.promptsButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
		},
		"aixcoding-agent.popoutButtonClicked": () => openClineInNewTab({ context, outputChannel }),
		"aixcoding-agent.openInNewTab": () => openClineInNewTab({ context, outputChannel }),
		"aixcoding-agent.settingsButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		},
		"aixcoding-agent.historyButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
		},
		"aixcoding-agent.helpButtonClicked": () => {
			vscode.env.openExternal(vscode.Uri.parse("http://22.189.54.139"))
		},
	}
}

const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	outputChannel.appendLine("在新窗口打开 AIxCoding")

	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const tabProvider = new ClineProvider(context, outputChannel)
	// const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const panel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "AIxCoding", targetCol, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	// TODO: use better svg icon with light and dark variants (see
	// https://stackoverflow.com/questions/58365687/vscode-extension-iconpath).
	panel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "logo.png"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "logo.png"),
	}

	await tabProvider.resolveWebviewView(panel)

	// Lock the editor group so clicking on files doesn't open them over the panel
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")
}
