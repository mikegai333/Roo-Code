import { Position, Range, TextEditor } from "vscode"

import { CLOSING_BRACKETS, OPENING_BRACKETS, QUOTES } from "../common/constants"
import { Bracket } from "../common/types"
import { getLanguage } from "./utils"
import { supportedLanguages } from "../common/languages"
import { getLineBreakCount } from "../webview/utils"

export class CompletionFormatter {
	private _characterAfterCursor: string
	private _charAfterCursor: string
	private _charBeforeCursor: string
	private _completion = ""
	private _cursorPosition: Position
	private _editor: TextEditor
	private _lineText: string
	private _normalisedCompletion = ""
	private _originalCompletion = ""
	private _textAfterCursor: string

	/**
	 * 构造函数，用于初始化 CompletionFormatter 实例。
	 * 它会捕获当前编辑器的状态，例如光标位置、光标前后的文本等，
	 * 以便为格式化补全建议做准备。
	 * @param editor - 当前活动的 VSCode 文本编辑器实例。
	 */
	constructor(editor: TextEditor) {
		this._editor = editor
		this._cursorPosition = this._editor.selection.active
		const document = editor.document
		const lineEndPosition = document.lineAt(this._cursorPosition.line).range.end
		const textAfterRange = new Range(this._cursorPosition, lineEndPosition)
		this._lineText = this._editor.document.lineAt(this._cursorPosition.line).text
		this._textAfterCursor = document?.getText(textAfterRange) || ""
		this._characterAfterCursor = this._textAfterCursor ? (this._textAfterCursor.at(0) as string) : ""
		this._editor = editor
		this._charBeforeCursor =
			this._cursorPosition.character > 0 ? this._lineText[this._cursorPosition.character - 1] : ""
		this._charAfterCursor = this._lineText[this._cursorPosition.character]
	}

	/**
	 * 检查一对括号是否匹配。
	 * @param open - 开括号字符，例如 '(', '[', '{'。
	 * @param close - 闭括号字符，例如 ')', ']', '}'。
	 * @returns 如果括号匹配则返回 true，否则返回 false。
	 */
	private isMatchingPair = (open?: Bracket, close?: string): boolean => {
		return (open === "[" && close === "]") || (open === "(" && close === ")") || (open === "{" && close === "}")
	}

	/**
	 * 匹配并处理补全建议中的括号。
	 * 这个方法会从头开始遍历补全字符串，确保括号是成对出现的。
	 * 如果遇到不匹配的闭括号，它会截断字符串，以防止生成无效的括号结构。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private matchCompletionBrackets = (): CompletionFormatter => {
		let accumulatedCompletion = ""
		const openBrackets: Bracket[] = []
		for (const character of this._originalCompletion) {
			if (OPENING_BRACKETS.includes(character)) {
				openBrackets.push(character)
			}

			if (CLOSING_BRACKETS.includes(character)) {
				if (openBrackets.length && this.isMatchingPair(openBrackets.at(-1), character)) {
					openBrackets.pop()
				} else {
					break // 发现不匹配的闭括号，停止累加
				}
			}
			accumulatedCompletion += character
		}

		this._completion = accumulatedCompletion.trimEnd() || this._originalCompletion.trimEnd()

		return this
	}

	/**
	 * 忽略只包含空白字符的补全建议。
	 * 如果补全建议在去除前后空格后为空字符串（但原始建议不是换行符），
	 * 则将补全建议设置为空字符串。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private ignoreBlankLines = (): CompletionFormatter => {
		if (this._completion.trimStart() === "" && this._originalCompletion !== "\n") {
			this._completion = this._completion.trim()
		}
		return this
	}

	/**
	 * 标准化文本，即去除字符串两端的空白字符。
	 * @param text - 需要标准化的字符串。
	 * @returns 返回处理后的字符串。
	 */
	private normalise = (text: string) => text?.trim()

	/**
	 * 移除补全建议中与光标后文本重复的部分。
	 * 它会比较补全建议的结尾和光标后文本的开头，找到重叠的部分并从补全建议中删除。
	 * 例如，如果补全是 `console.log("hello")`，光标后是 `("hello")`，则补全会变为 `console.log`。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private removeDuplicateText() {
		const after = this.normalise(this._textAfterCursor)

		const maxLength = Math.min(this._completion.length, after.length)
		let overlapLength = 0

		for (let length = 1; length <= maxLength; length++) {
			const endOfCompletion = this._completion.substring(this._completion.length - length)
			const startOfAfter = after.substring(0, length)
			if (endOfCompletion === startOfAfter) {
				overlapLength = length
			}
		}

		if (overlapLength > 0) {
			this._completion = this._completion.substring(0, this._completion.length - overlapLength)
		}

		return this
	}

	/**
	 * 检查光标当前是否位于一个单词的中间。
	 * @returns 如果光标前后都有单词字符，则返回 true，否则返回 false。
	 */
	private isCursorAtMiddleOfWord(): boolean {
		return Boolean(this._charAfterCursor && /\w/.test(this._charBeforeCursor) && /\w/.test(this._charAfterCursor))
	}

	/**
	 * 当光标位于单词中间时，移除补全建议中不必要的引号。
	 * 这可以防止在单词中间插入带引号的字符串。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private removeUnnecessaryMiddleQuote(): CompletionFormatter {
		const isCursorAtMiddle = this.isCursorAtMiddleOfWord()
		if (isCursorAtMiddle) {
			if (QUOTES.includes(this._completion[0])) {
				this._completion = this._completion.substring(1)
			}
			if (QUOTES.includes(this._completion.at(-1) as string)) {
				this._completion = this._completion.slice(0, -1)
			}
		}
		return this
	}

	/**
	 * 移除补全建议末尾多余的引号。
	 * 如果补全建议以引号结尾，并且光标后的字符也是同一个引号，
	 * 则移除补全建议末尾的引号以避免重复。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private removeDuplicateQuotes = () => {
		const trimmedCharAfterCursor = this._characterAfterCursor.trim()
		const lastCharOfCompletion = this._completion.at(-1) as string

		if (
			trimmedCharAfterCursor &&
			(this._normalisedCompletion.endsWith("',") ||
				this._normalisedCompletion.endsWith('",') ||
				(this._normalisedCompletion.endsWith("`,") && QUOTES.includes(trimmedCharAfterCursor)))
		) {
			this._completion = this._completion.slice(0, -2)
		} else if (
			(this._normalisedCompletion.endsWith("'") ||
				this._normalisedCompletion.endsWith('"') ||
				this._normalisedCompletion.endsWith("`")) &&
			QUOTES.includes(trimmedCharAfterCursor)
		) {
			this._completion = this._completion.slice(0, -1)
		} else if (QUOTES.includes(lastCharOfCompletion) && trimmedCharAfterCursor === lastCharOfCompletion) {
			this._completion = this._completion.slice(0, -1)
		}

		return this
	}

	/**
	 * 防止生成与后续几行代码重复的补全建议。
	 * 它会检查光标位置后的几行代码，如果发现与补全建议完全相同的内容，
	 * 则会清空补全建议。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private preventDuplicateLine = (): CompletionFormatter => {
		const lineCount = this._editor.document.lineCount
		let nextLineIndex = this._cursorPosition.line + 1
		while (nextLineIndex < this._cursorPosition.line + 3 && nextLineIndex < lineCount) {
			const line = this._editor.document.lineAt(nextLineIndex)
			if (this.normalise(line.text) === this.normalise(this._originalCompletion)) {
				this._completion = ""
				return this
			}
			nextLineIndex++
		}

		return this
	}

	/**
	 * 移除无效的换行符。
	 * 如果光标后方在同一行还有文本，则移除补全建议末尾的任何空白字符（包括换行符）。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	public removeInvalidLineBreaks = (): CompletionFormatter => {
		if (this._textAfterCursor) {
			this._completion = this._completion.trimEnd()
		}
		return this
	}

	/**
	 * 如果光标在单词中间，则跳过（清空）补全建议。
	 * 这可以防止在输入单词时被补全建议打断。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private skipMiddleOfWord() {
		if (this.isCursorAtMiddleOfWord()) {
			this._completion = ""
		}
		return this
	}

	/**
	 * 跳过与光标后文本相似度过高的补全建议。
	 * 使用一个评分函数来比较补全建议和光标后的文本，如果相似度超过阈值（0.6），
	 * 则清空补全建议。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private skipSimilarCompletions = (): this => {
		const { document } = this._editor
		const textAfter: any = document.getText(
			new Range(this._cursorPosition, document.lineAt(this._cursorPosition.line).range.end),
		)

		if (textAfter.score(this._completion) > 0.6) {
			this._completion = ""
		}

		return this
	}

	/**
	 * 获取最终的补全建议。
	 * 在所有格式化步骤之后，如果补全建议只剩下空白字符，则将其清空。
	 * @returns 返回最终处理过的补全字符串。
	 */
	private getCompletion = () => {
		if (this._completion.trim().length === 0) {
			this._completion = ""
		}
		return this._completion
	}

	/**
	 * 修剪补全建议开头的空白。
	 * 仅当光标位置在补全建议的第一个非空白字符之前或之处时，才执行修剪。
	 * 这有助于保留用户期望的缩进。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	private trimStart = () => {
		const firstNonSpaceIndex = this._completion.search(/\S/)

		if (firstNonSpaceIndex > 0 && this._cursorPosition.character <= firstNonSpaceIndex) {
			this._completion = this._completion.trimStart()
		}
		return this
	}

	/**
	 * 阻止提供引用性或元注释类的补全。
	 * 例如，移除像 `// File: ...` 或 `// Language: ...` 这样的注释行。
	 * 它会根据当前语言的注释语法来识别并过滤这些行。
	 * @returns 返回 CompletionFormatter 实例，以便进行链式调用。
	 */
	public preventQuotationCompletions(): this {
		const language = getLanguage()
		const languageId = supportedLanguages[language.languageId as keyof typeof supportedLanguages]
		if (this._normalisedCompletion.startsWith("// File:") || this._normalisedCompletion === "//") {
			this._completion = ""
			return this
		}

		if (!languageId || !languageId.syntaxComments || !languageId.syntaxComments.start) {
			return this
		}

		if (!languageId || !languageId.syntaxComments) return this

		const lineCount = getLineBreakCount(this._completion)

		if (lineCount > 1) return this

		const completionLines = this._completion.split("\n").filter((line) => {
			const startsWithComment = line.startsWith(languageId.syntaxComments.start)
			const includesCommentReference = /\b(Language|File|End):\s*(.*)\b/.test(line)
			const isComment = line.startsWith(languageId.syntaxComments.start)
			return !(startsWithComment && includesCommentReference) && !isComment
		})

		if (completionLines.length) {
			this._completion = completionLines.join("\n")
		}

		return this
	}

	/**
	 * 用于调试的方法。
	 * 将格式化过程中的一些关键内部状态（如光标后文本、原始补全等）打印到控制台。
	 */
	public debug() {
		console.log(`text after: ${this._textAfterCursor}`)
		console.log(`original completion: ${this._originalCompletion}`)
		console.log(`normalised completion: ${this._normalisedCompletion}`)
		console.log(`character after: ${this._characterAfterCursor}`)
	}

	/**
	 * 格式化主函数。
	 * 这是该类的公共入口点。它接收一个原始的补全字符串，
	 * 然后按预定顺序依次调用所有私有的格式化方法，
	 * 对字符串进行处理和优化，最后返回一个干净、可用的补全建议。
	 * @param completion - 从语言模型或其他来源获得的原始补全字符串。
	 * @returns 返回经过一系列规则处理后的最终补全字符串。
	 */
	public format = (completion: string): string => {
		this._completion = ""
		this._normalisedCompletion = this.normalise(completion)
		this._originalCompletion = completion
		const infillText = this.matchCompletionBrackets()
			.preventQuotationCompletions()
			.preventDuplicateLine()
			.removeDuplicateQuotes()
			.removeUnnecessaryMiddleQuote()
			.ignoreBlankLines()
			.removeInvalidLineBreaks()
			.removeDuplicateText()
			.skipMiddleOfWord()
			.skipSimilarCompletions()
			.trimStart()
			.getCompletion()
		return infillText
	}
}
