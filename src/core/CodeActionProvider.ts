import * as vscode from "vscode"
import { EditorUtils } from "./EditorUtils"

export const ACTION_NAMES = {
	EXPLAIN: "AIxCoding：解释代码",
	FIX: "AIxCoding：修复代码",
	FIX_LOGIC: "AIxCoding：修复逻辑",
	IMPROVE: "AIxCoding：改进代码",
	ADD_TO_CONTEXT: "AIxCoding：添加到上下文",

	CHECK: "AIxCoding：检查代码",
	COMMENTS: "AIxCoding：生成注释",
	TEST: "AIxCoding：编写测试",
} as const

export const COMMAND_IDS = {
	EXPLAIN: "aixcoding.explainCode",
	FIX: "aixcoding.fixCode",
	IMPROVE: "aixcoding.improveCode",
	ADD_TO_CONTEXT: "aixcoding.addToContext",

	CHECK: "aixcoding.checkCode",
	COMMENTS: "aixcoding.addComments",
	TEST: "aixcoding.addTest",
} as const

export class CodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix,
		vscode.CodeActionKind.RefactorRewrite,
	]

	private createAction(title: string, kind: vscode.CodeActionKind, command: string, args: any[]): vscode.CodeAction {
		const action = new vscode.CodeAction(title, kind)
		action.command = { command, title, arguments: args }
		return action
	}

	private createActionPair(
		baseTitle: string,
		kind: vscode.CodeActionKind,
		baseCommand: string,
		args: any[],
	): vscode.CodeAction[] {
		return [
			this.createAction(`${baseTitle} 在新任务中`, kind, baseCommand, args),
			this.createAction(`${baseTitle} 在当前任务中`, kind, `${baseCommand} 在当前任务中`, args),
		]
	}

	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		try {
			const effectiveRange = EditorUtils.getEffectiveRange(document, range)
			if (!effectiveRange) {
				return []
			}

			const filePath = EditorUtils.getFilePath(document)
			const actions: vscode.CodeAction[] = []

			actions.push(
				...this.createActionPair(ACTION_NAMES.EXPLAIN, vscode.CodeActionKind.QuickFix, COMMAND_IDS.EXPLAIN, [
					filePath,
					effectiveRange.text,
				]),
			)

			if (context.diagnostics.length > 0) {
				const relevantDiagnostics = context.diagnostics.filter((d) =>
					EditorUtils.hasIntersectingRange(effectiveRange.range, d.range),
				)

				if (relevantDiagnostics.length > 0) {
					const diagnosticMessages = relevantDiagnostics.map(EditorUtils.createDiagnosticData)
					actions.push(
						...this.createActionPair(ACTION_NAMES.FIX, vscode.CodeActionKind.QuickFix, COMMAND_IDS.FIX, [
							filePath,
							effectiveRange.text,
							diagnosticMessages,
						]),
					)
				}
			} else {
				actions.push(
					...this.createActionPair(ACTION_NAMES.FIX_LOGIC, vscode.CodeActionKind.QuickFix, COMMAND_IDS.FIX, [
						filePath,
						effectiveRange.text,
					]),
				)
			}

			actions.push(
				...this.createActionPair(
					ACTION_NAMES.IMPROVE,
					vscode.CodeActionKind.RefactorRewrite,
					COMMAND_IDS.IMPROVE,
					[filePath, effectiveRange.text],
				),
			)

			actions.push(
				this.createAction(
					ACTION_NAMES.ADD_TO_CONTEXT,
					vscode.CodeActionKind.QuickFix,
					COMMAND_IDS.ADD_TO_CONTEXT,
					[filePath, effectiveRange.text],
				),
			)

			return actions
		} catch (error) {
			console.error("Error providing code actions:", error)
			return []
		}
	}
}
