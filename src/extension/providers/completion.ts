import {
	InlineCompletionItem,
	InlineCompletionItemProvider,
	InlineCompletionList,
	Position,
	Range,
	TextDocument,
	workspace,
	StatusBarItem,
	window,
	Uri,
	InlineCompletionContext,
	InlineCompletionTriggerKind,
	ExtensionContext,
	Command,
	InlineCompletionDisplayLocation,
	InlineCompletionEndOfLifeReason,
	InlineCompletionEndOfLifeReasonKind,
	env,
	version,
} from "vscode"
import Parser, { SyntaxNode } from "web-tree-sitter"
import AsyncLock from "async-lock"
import "string_score"
import {
	getFimDataFromProvider as getProviderFimData,
	getPrefixSuffix,
	getShouldSkipCompletion,
	getIsMiddleOfString,
	getIsMultilineCompletion,
	getCurrentLineText,
	triggerCompletion,
} from "../utils"
import { cache } from "../cache"
import { supportedLanguages } from "../../common/languages"
import {
	FimTemplateData,
	PrefixSuffix,
	ResolvedInlineCompletion,
	StreamRequestOptions,
	StreamResponse,
} from "../../common/types"
import { getFimPrompt, getStopWords } from "../fim-templates"
import {
	ACTIVE_FIM_PROVIDER_STORAGE_KEY,
	FIM_TEMPLATE_FORMAT,
	LINE_BREAK_REGEX,
	MAX_CONTEXT_LINE_COUNT,
	MAX_EMPTY_COMPLETION_CHARS,
	MIN_COMPLETION_CHUNKS,
	MULTI_LINE_DELIMITERS,
	MULTILINE_INSIDE,
	MULTILINE_OUTSIDE,
} from "../../common/constants"
import { streamResponse } from "../stream"
import { createStreamRequestBodyFim } from "../provider-options"
import { Logger } from "../../common/logger"
import { CompletionFormatter } from "../completion-formatter"
import { FileInteractionCache } from "../file-interaction"
import { getLineBreakCount } from "../../webview/utils"
import { TemplateProvider } from "../template-provider"
import { TwinnyProvider } from "../provider-manager"
import { getNodeAtPosition, getParser } from "../parser-utils"
import { telemetry } from "../../common/constants"
import { v4 as uuidv4 } from "uuid"
import { VsCodeIde } from "../util/VsCodeIde"
import { getAllSnippets } from "../snippets"
import { HelperVars } from "../util/HelperVars"
import { ContextRetrievalService } from "../snippets/ContextRetrievalService"
import { TabAutocompleteOptions } from "../util"
import { renderPrompt } from "../snippets/template"
import * as path from "path"
import {
	DiagnosticsNextEditProvider,
	DiagnosticsNextEditResult,
	INextEditProvider,
} from "../../copilot/extension/inlineEdits/vscode-node/features/diagnosticsInlineEditProvider"
import { VSCodeWorkspace } from "../../copilot/extension/inlineEdits/vscode-node/parts/vscodeWorkspace"
import { CancellationToken, CancellationTokenSource } from "../../copilot/util/vs/base/common/cancellation"
import { INextEditResult } from "../../copilot/extension/inlineEdits/node/nextEditResult"
import { DocumentId } from "../../copilot/platform/inlineEdits/common/dataTypes/documentId"
import { InlineEditRequestLogContext } from "../../copilot/platform/inlineEdits/common/inlineEditLogContext"
import { OffsetRange } from "../../copilot/util/vs/editor/common/core/ranges/offsetRange"
import { ShowNextEditPreference } from "../../copilot/platform/inlineEdits/common/statelessNextEditProvider"
import { toExternalRange } from "../../copilot/extension/inlineEdits/vscode-node/features/diagnosticsBasedCompletions/diagnosticsCompletions"
import { language } from "../../copilot/util/vs/base/common/platform"
import { report } from "process"

abstract class BaseNesCompletionInfo<T extends INextEditResult> {
	public abstract source: string

	constructor(
		public readonly suggestion: T,
		public readonly documentId: DocumentId,
		public readonly document: TextDocument,
		public readonly requestUuid: string,
	) {}
}
export interface NesCompletionItem extends InlineCompletionItem {
	readonly info: NesCompletionInfo
	wasShown: boolean
}
class NesCompletionList extends InlineCompletionList {
	public override enableForwardStability = true

	constructor(
		public readonly requestUuid: string,
		item: NesCompletionItem | undefined,
		public override readonly commands: Command[],
	) {
		super(item === undefined ? [] : [item])
	}
}
enum InlineCompletionReportKind {
	Accepted = "202",
	Rejected = "204",
	Ignored = "203",
	Shown = "201",
}
export class DiagnosticsCompletionInfo extends BaseNesCompletionInfo<DiagnosticsNextEditResult> {
	public readonly source = "diagnostics"
}
export type NesCompletionInfo = DiagnosticsCompletionInfo
export class CompletionProvider implements InlineCompletionItemProvider {
	private _abortController: AbortController | null
	private _acceptedLastCompletion = false
	private _completionCacheEnabled = false
	private _chunkCount = 0
	private _completion = ""
	private _nodeAtPosition: SyntaxNode | null = null
	private _debouncer: NodeJS.Timeout | undefined
	private _debounceWait = 0 as number
	private _autoSuggestEnabled: boolean = false
	private _document: TextDocument | null
	private _enabled = true
	private enableSubsequentCompletions = true as boolean
	private _extensionContext: ExtensionContext
	private _fileInteractionCache: FileInteractionCache
	private _isMultilineCompletion = false
	private _keepAlive = "5m" as string | number
	private _lastCompletionMultiline = false
	public lastCompletionText = ""
	private _lock: AsyncLock
	private _logger: Logger
	private _maxLines = 30 as number
	private _multilineCompletionsEnabled = false as boolean
	private _nonce = 0
	private _numLineContext = 100 as number
	private _numPredictFim = 512 as number
	private _parser: Parser | undefined
	private _position: Position | null
	private _prefixSuffix: PrefixSuffix = { prefix: "", suffix: "" }
	private _statusBar: StatusBarItem
	private _temperature = 0.8 as number
	private _templateProvider: TemplateProvider
	private _fileContextEnabled = false as boolean
	private _usingFimTemplate = false
	private _requestId = ""
	private _isAborted = false
	private _globalState
	private _secretState
	private contextRetrievalService: ContextRetrievalService
	private completionContext: InlineCompletionContext | undefined
	private _apiKey: string | undefined
	private _baseApi: string | undefined

	constructor(
		statusBar: StatusBarItem,
		fileInteractionCache: FileInteractionCache,
		templateProvider: TemplateProvider,
		extentionContext: ExtensionContext,
		private ide: VsCodeIde,
		private diagnosticsProvider: DiagnosticsNextEditProvider,
		private readonly _workspace: VSCodeWorkspace,
	) {
		this._extensionContext = extentionContext
		this._abortController = null
		this._document = null
		this._lock = new AsyncLock()
		this._logger = new Logger()
		this._position = null
		this._statusBar = statusBar
		this._fileInteractionCache = fileInteractionCache
		this._templateProvider = templateProvider
		this._globalState = extentionContext.globalState
		this._secretState = extentionContext.secrets
		this._autoSuggestEnabled = extentionContext.globalState.get("enableCompletion", false)
		this.contextRetrievalService = new ContextRetrievalService(this.ide)
		this._baseApi = this._globalState.get("baseApi")
		this._apiKey = this._globalState.get("openAiApiKey")
	}

	public async provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken,
	): Promise<InlineCompletionItem[] | InlineCompletionList | NesCompletionList | null | undefined> {
		this.completionContext = context
		this._isAborted = false
		console.log("[AIXCODING] provideInlineCompletionItems called, enableCompletion:", this._autoSuggestEnabled)

		const editor = window.activeTextEditor
		if (
			!this._enabled ||
			!editor ||
			getShouldSkipCompletion(context, this._autoSuggestEnabled) ||
			!triggerCompletion()
		) {
			return this.handleEarlyReturn(context)
		}

		this._document = document
		this._position = position
		this._prefixSuffix = getPrefixSuffix(this._numLineContext, document, position)

		const cachedCompletion = cache.getCache(this._prefixSuffix)
		if (cachedCompletion && this._completionCacheEnabled) {
			this._completion = cachedCompletion
			return this.provideInlineCompletion()
		}

		this._statusBar.text = "$(loading~spin) AI×Coding"

		const diagnosticsResult = await this._provideDiagnosticsCompletion(document, context, token)

		if (token.isCancellationRequested) {
			this._statusBar.text = "$(check) AI×Coding"
			return
		}

		if (diagnosticsResult) {
			this._statusBar.text = "$(check) AI×Coding"
			return diagnosticsResult
		}

		// Fallback to standard completion if diagnostics completion returns nothing
		return this._provideStandardCompletion(document, position, context, token)
	}

	public handleEndOfLifetime(item: NesCompletionItem, reason: InlineCompletionEndOfLifeReason): void {
		console.log("requestUuid", this._requestId)
		switch (reason.kind) {
			case InlineCompletionEndOfLifeReasonKind.Accepted: {
				this._handleAcceptance(item)
				break
			}
			case InlineCompletionEndOfLifeReasonKind.Rejected: {
				this._handleDidRejectCompletionItem(item)
				break
			}
			case InlineCompletionEndOfLifeReasonKind.Ignored: {
				const supersededBy = reason.supersededBy ? (reason.supersededBy as NesCompletionItem) : undefined
				this._handleDidIgnoreCompletionItem(item, supersededBy)
				break
			}
		}
	}
	// 报告补全结果显示事件
	public handleDidShowCompletionItem(completionItem: NesCompletionItem, updatedInsertText: string) {
		console.log("shown", completionItem, updatedInsertText)
		this.reportEvent(InlineCompletionReportKind.Shown, completionItem)
	}
	// 报告补全结果接受事件
	private _handleAcceptance(item: NesCompletionItem) {
		console.log("accept", item)
		this.setAcceptedLastCompletion(true)
		this.updateEvent(InlineCompletionReportKind.Accepted)
	}
	// 报告补全结果拒绝事件
	private _handleDidRejectCompletionItem(item: NesCompletionItem) {
		console.log("reject", item)
		this.setAcceptedLastCompletion(false)
		this.updateEvent(InlineCompletionReportKind.Rejected)
	}

	// 报告补全结果忽略事件
	private _handleDidIgnoreCompletionItem(item: NesCompletionItem, supersededBy: NesCompletionItem | undefined) {
		console.log("ignored", item, supersededBy)
		this.setAcceptedLastCompletion(false)
		this.updateEvent(InlineCompletionReportKind.Ignored)
	}

	public reportEvent(clientStatus: string, completionItem: NesCompletionItem) {
		// console.log(this.completionContext.requestUuid)
		const apiUrl = `${this._baseApi}/api/v1/report/completion-event`
		const clientRequestId = this.completionContext?.requestUuid
		const completionLines = getLineBreakCount(completionItem.insertText as string)
		const reportBody = {
			clientRequestId,
			clientName: telemetry.ideName,
			clientVersion: telemetry.ideVersion,
			pluginVersion: telemetry.pluginVersion,
			projectName: telemetry.projectName,
			fileName: this._document?.fileName || "",
			completionType: completionItem.isInlineEdit ? "diagnostics" : "llm",
			triggerType: this._globalState.get("completionMode") === "1" ? "multiple" : "line",
			clientStatus,
			completionLines,
			language: this._document?.languageId,
		}
		fetch(apiUrl, {
			method: "POST", // 或 'PUT'
			headers: {
				"Content-Type": "application/json",
				Token: this._apiKey || "",
			},
			body: JSON.stringify(reportBody),
		})
			.then((response) => response.json())
			.then((data) => console.log("Success:", data))
			.catch((error) => console.error("Error:", error))
	}

	// 更新事件状态
	public updateEvent(clientStatus: string) {
		const apiUrl = `${this._baseApi}/api/v1/report/completion-event/update`
		const clientRequestId = this.completionContext?.requestUuid
		const reportBody = {
			clientRequestId,
			clientStatus,
		}
		fetch(apiUrl, {
			method: "POST", // 或 'PUT'
			headers: {
				"Content-Type": "application/json",
				Token: this._apiKey || "",
			},
			body: JSON.stringify(reportBody),
		})
			.then((response) => response.json())
			.then((data) => console.log("Success:", data))
			.catch((error) => console.error("Error:", error))
	}
	private handleEarlyReturn(context: InlineCompletionContext) {
		if (context.triggerKind === InlineCompletionTriggerKind.Invoke && this._autoSuggestEnabled) {
			this._completion = this.lastCompletionText
			return this.provideInlineCompletion()
		}
		this._lastCompletionMultiline = false
		return
	}

	private async _provideDiagnosticsCompletion(
		document: TextDocument,
		context: InlineCompletionContext,
		token: CancellationToken,
	): Promise<NesCompletionList | undefined> {
		const doc = this._workspace.getDocumentByTextDocument(document)
		if (!doc) return undefined

		try {
			const logContext = new InlineEditRequestLogContext(doc.id.uri, document.version, context)

			const diagnosticsPromise = this.diagnosticsProvider.runUntilNextEdit(doc.id, context, logContext, 50, token)

			const timeoutPromise = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 750))

			const diagnosticsSuggestion = await Promise.race([diagnosticsPromise, timeoutPromise])

			if (!diagnosticsSuggestion) {
				return undefined
			}

			if (diagnosticsSuggestion.result && diagnosticsSuggestion.result.edit.newText) {
				const suggestionInfo = new DiagnosticsCompletionInfo(
					diagnosticsSuggestion,
					doc.id,
					document,
					context.requestUuid,
				)
				const { result } = suggestionInfo.suggestion
				if (!result) return undefined
				const range = this.documentRangeFromOffsetRange(document, result.edit.replaceRange)
				const showRange = new Range(
					Math.max(range.start.line - 4, 0),
					0,
					range.end.line + 4,
					Number.MAX_SAFE_INTEGER,
				)
				const displayLocation = result.displayLocation
					? {
							range: toExternalRange(result.displayLocation.range),
							label: result.displayLocation.label,
						}
					: undefined
				const inlineEdit: NesCompletionItem = {
					insertText: result.edit.newText,
					range,
					showRange: undefined,
					info: suggestionInfo,
					isInlineEdit: true,
					showInlineEditMenu: true,
					displayLocation,
					wasShown: false,
				}
				return new NesCompletionList(context.requestUuid, inlineEdit, [])
			}
		} catch (error) {
			this._statusBar.text = "$(check) AI×Coding"
			console.error("Error getting diagnostics completion, falling back to standard completion.", error)
		}
		return undefined
	}

	private async _provideStandardCompletion(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken,
	): Promise<ResolvedInlineCompletion> {
		this._chunkCount = 0
		this._nonce = this._nonce + 1

		this._parser = await getParser(document.uri.fsPath)
		try {
			if (this._parser) {
				const text = document.getText()
				const tree = this._parser.parse(text)
				this._nodeAtPosition = getNodeAtPosition(tree, position)
			}
		} catch (error) {
			console.error("Parsing failed:", error)
		}

		this._isMultilineCompletion = getIsMultilineCompletion({
			node: this._nodeAtPosition,
			prefixSuffix: this._prefixSuffix,
		})

		if (this._debouncer) clearTimeout(this._debouncer)

		const prompt = await this.getPrompt(this._prefixSuffix)
		if (!prompt) return this.provideInlineCompletion()

		return new Promise((resolve, reject) => {
			const cancellationListener = token.onCancellationRequested(() => {
				clearTimeout(this._debouncer)
				this._abortController?.abort()
				cancellationListener.dispose()
				this._statusBar.text = "$(check) AI×Coding"
				reject(new Error("Completion request was cancelled."))
			})

			this._debouncer = setTimeout(() => {
				this._lock.acquire("twinny.completion", async () => {
					if (token.isCancellationRequested) {
						cancellationListener.dispose()
						return reject(new Error("Completion request was cancelled."))
					}

					const provider = this.getProvider()
					if (!provider) {
						cancellationListener.dispose()
						return resolve(this.provideInlineCompletion())
					}

					const request = this.buildStreamRequest(prompt, provider)
					const fileName = path.basename(document.fileName)
					const newTelemetry = {
						...telemetry,
						requestId: context.requestUuid,
						fileName,
						language: document.languageId,
					}
					const requestBody = { ...request.body, telemetry: newTelemetry }
					this._requestId = newTelemetry.requestId

					try {
						await streamResponse({
							body: requestBody,
							options: request.options,
							onStart: (controller) => (this._abortController = controller),
							onEnd: () => {
								this.onEnd(resolve, token)
								cancellationListener.dispose()
							},
							onError: (error) => {
								console.error(error)
								this.onError()
								cancellationListener.dispose()
								reject(error)
							},
							onData: (data) => {
								if (this._isAborted || token.isCancellationRequested) {
									this._abortController?.abort()
									return
								}
								const completion = this.onData(data)
								if (completion) {
									this._abortController?.abort()
									this._isAborted = true
								}
							},
						})
					} catch (error) {
						console.error(error)
						this.onError()
						cancellationListener.dispose()
						reject(error)
					}
				})
			}, this._debounceWait)
		})
	}

	private documentRangeFromOffsetRange(doc: TextDocument, range: OffsetRange): Range {
		return new Range(doc.positionAt(range.start), doc.positionAt(range.endExclusive))
	}
	private buildStreamRequest(prompt: string, provider: TwinnyProvider) {
		const body = createStreamRequestBodyFim(provider.provider, prompt, {
			model: provider.modelName,
			numPredictFim: this._numPredictFim,
			temperature: this._temperature,
			keepAlive: this._keepAlive,
		})

		const options: StreamRequestOptions = {
			hostname: provider.apiHostname,
			port: Number(provider.apiPort),
			path: provider.apiPath,
			protocol: provider.apiProtocol,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: provider.apiKey ? `Bearer ${provider.apiKey}` : "",
				Token: provider.apiKey || "",
			},
		}

		return { options, body }
	}

	private onData(data: StreamResponse | undefined): string {
		const provider = this.getProvider()
		if (!provider) return ""

		try {
			const providerFimData = getProviderFimData(provider.provider, data)
			if (providerFimData === undefined) return ""

			this._completion = this._completion + providerFimData
			this._chunkCount = this._chunkCount + 1

			if (this._completion.length > MAX_EMPTY_COMPLETION_CHARS && this._completion.trim().length === 0) {
				this.abortCompletion()
				this._logger.log(`Streaming response end as llm in empty completion loop:  ${this._nonce}`)
			}

			if (
				!(this._globalState.get("completionMode") === "1") &&
				this._chunkCount >= MIN_COMPLETION_CHUNKS &&
				LINE_BREAK_REGEX.test(this._completion.trimStart())
			) {
				this._logger.log(
					`Streaming response end due to single line completion:  ${this._nonce} \nCompletion: ${this._completion}`,
				)
				console.log(`由于设置的是单行补全所以停止接收`, this._abortController)
				this._abortController?.abort()
				const lastLineBreakIndex = this._completion.lastIndexOf("\n")
				console.log("lastLineBreakIndex", lastLineBreakIndex)
				// 处理完整的行
				this._completion = this._completion.substring(0, lastLineBreakIndex)
				return this._completion
			}

			const isMultilineCompletionRequired =
				!this._isMultilineCompletion &&
				!(this._globalState.get("completionMode") === "1") &&
				this._chunkCount >= MIN_COMPLETION_CHUNKS &&
				LINE_BREAK_REGEX.test(this._completion.trimStart())
			if (isMultilineCompletionRequired) {
				this._logger.log(
					`Streaming response end due to multiline not required  ${this._nonce} \nCompletion: ${this._completion}`,
				)
				this._abortController?.abort()
				console.log(`由于根据判定不需要多行补全所以停止接收`, this._abortController)
				return this._completion
			}

			try {
				if (this._nodeAtPosition) {
					const takeFirst =
						MULTILINE_OUTSIDE.includes(this._nodeAtPosition?.type) ||
						(MULTILINE_INSIDE.includes(this._nodeAtPosition?.type) && this._nodeAtPosition?.childCount > 2)

					const lineText = getCurrentLineText(this._position) || ""
					if (!this._parser) return ""

					if (providerFimData.includes("\n")) {
						const { rootNode } = this._parser.parse(`${lineText}${this._completion}`)

						const { hasError } = rootNode

						if (
							this._parser &&
							this._nodeAtPosition &&
							this._isMultilineCompletion &&
							this._chunkCount >= 2 &&
							takeFirst &&
							!hasError
						) {
							if (MULTI_LINE_DELIMITERS.some((delimiter) => this._completion.endsWith(delimiter))) {
								this._logger.log(
									`Streaming response end due to delimiter ${this._nonce} \nCompletion: ${this._completion}`,
								)
								return this._completion
							}
						}
					}
				}
			} catch (e) {
				// Currently doesnt catch when parser fucks up
				this.abortCompletion()
			}

			if (getLineBreakCount(this._completion) >= this._maxLines) {
				return this._completion
			}

			return ""
		} catch (e) {
			return ""
		}
	}

	private onEnd(resolve: (completion: ResolvedInlineCompletion) => void, token: CancellationToken) {
		if (token.isCancellationRequested) {
			this.abortCompletion()
			return resolve([])
		}
		return resolve(this.provideInlineCompletion())
	}

	public onError = (e?: Error) => {
		this._abortController?.abort()
		console.error(e)
	}

	private getPromptHeader(languageId: string | undefined, uri: Uri) {
		const lang = supportedLanguages[languageId as keyof typeof supportedLanguages]
		if (!lang) {
			return ""
		}

		const language = `${lang.syntaxComments?.start || ""} Language: ${
			lang?.langName
		} (${languageId}) ${lang.syntaxComments?.end || ""}`

		const path = `${lang.syntaxComments?.start || ""} File uri: ${uri.toString()} (${languageId}) ${
			lang.syntaxComments?.end || ""
		}`

		return `\n${language}\n${path}\n`
	}

	private async getFileInteractionContext() {
		const interactions = this._fileInteractionCache.getAll()
		const currentFileName = this._document?.fileName || ""

		const fileChunks: string[] = []
		for (const interaction of interactions) {
			const filePath = interaction.name

			if (filePath.toString().match(".git")) {
				continue
			}

			const uri = Uri.file(filePath)

			if (currentFileName === filePath) continue

			const activeLines = interaction.activeLines

			const document = await workspace.openTextDocument(uri)
			const lineCount = document.lineCount

			if (lineCount > MAX_CONTEXT_LINE_COUNT) {
				const averageLine = activeLines.reduce((acc, curr) => acc + curr.line, 0) / activeLines.length
				const start = new Position(Math.max(0, Math.ceil(averageLine || 0) - 100), 0)
				const end = new Position(Math.min(lineCount, Math.ceil(averageLine || 0) + 100), 0)
				fileChunks.push(
					`
          // File: ${filePath}
          // Content: \n ${document.getText(new Range(start, end))}
        `.trim(),
				)
			} else {
				fileChunks.push(
					`
          // File: ${filePath}
          // Content: \n ${document.getText()}
        `.trim(),
				)
			}
		}

		return fileChunks.join("\n")
	}

	private removeStopWords(completion: string) {
		const provider = this.getProvider()
		if (!provider) return completion
		let filteredCompletion = completion
		const stopWords = getStopWords(provider.modelName, provider.fimTemplate || FIM_TEMPLATE_FORMAT.automatic)
		stopWords.forEach((stopWord) => {
			filteredCompletion = filteredCompletion.split(stopWord).join("")
		})
		// The user's feedback indicates the model is returning markdown formatted code.
		// We need to remove the markdown code block fences.
		filteredCompletion = filteredCompletion.replace(/```/g, "")
		return filteredCompletion
	}

	private async getPrompt(prefixSuffix: PrefixSuffix) {
		const provider = this.getProvider()
		if (!provider) return ""
		if (!this._document || !this._position || !provider) return ""

		const documentLanguage = this._document.languageId
		const fileInteractionContext = await this.getFileInteractionContext()
		if (!this._document || this._document?.isUntitled) {
			if (provider.fimTemplate === FIM_TEMPLATE_FORMAT.custom) {
				const systemMessage = await this._templateProvider.readSystemMessageTemplate("fim-system.hbs")

				const fimTemplate = await this._templateProvider.renderTemplate<FimTemplateData>("fim", {
					prefix: prefixSuffix.prefix,
					suffix: prefixSuffix.suffix,
					systemMessage,
					context: fileInteractionContext,
					fileName: this._document.uri.fsPath,
				})

				if (fimTemplate) {
					this._usingFimTemplate = true
					return fimTemplate
				}
			}
			const prompt = getFimPrompt(provider.modelName, provider.fimTemplate || FIM_TEMPLATE_FORMAT.automatic, {
				context: fileInteractionContext || "",
				prefixSuffix,
				header: this.getPromptHeader(documentLanguage, this._document.uri),
				fileContextEnabled: this._fileContextEnabled,
				language: documentLanguage,
			})
			return prompt
		} else {
			const option: TabAutocompleteOptions = { maxPromptTokens: 8000 }
			const helper = await HelperVars.create(prefixSuffix, this._document, this.ide, option, provider.modelName)
			const [snippetPayload, workspaceDirs] = await Promise.all([
				getAllSnippets({
					helper,
					ide: this.ide,
					//   getDefinitionsFromLsp: this.getDefinitionsFromLsp,
					contextRetrievalService: this.contextRetrievalService,
				}),
				this.ide.getWorkspaceDirs(),
			])
			const { prompt, prefix, suffix, completionOptions } = renderPrompt({
				snippetPayload,
				workspaceDirs,
				helper,
				document: this._document,
			})
			return prompt
		}
	}

	private getProvider = () => {
		// return this._extensionContext.globalState.get<TwinnyProvider>(
		//   ACTIVE_FIM_PROVIDER_STORAGE_KEY
		// );
		const env: string = "test1"
		if (env === "test") {
			return {
				apiHostname: "api.together.xyz",
				apiPath: "/v1/chat/completions",
				apiPort: 1234, //7680,
				apiProtocol: "https",
				id: "77b8dc81-6a90-4ce8-92b8-2c980d1ac1e1",
				label: "deepseek-completions-copy",
				modelName: "deepseek-ai/DeepSeek-V3",
				provider: "lmstudio",
				type: "fim",
				apiKey: "ceff08317dff4852b63ff0ae8f6c4502dac6923de4c7bac0ee59ff6336104867",
				fimTemplate: "deepseek",
			}
		} else {
			const baseApi = this._globalState.get("baseApi")
			const apiKey = this._globalState.get("openAiApiKey")
			return {
				apiHostname: (baseApi as string).replace("http://", ""),
				apiPath: "/api/v1/completions/code",
				apiPort: 1234, //7680,
				apiProtocol: "http",
				id: "77b8dc81-6a90-4ce8-92b8-2c980d1ac1e1",
				label: "deepseek-completions-copy",
				modelName: "qwencoder",
				provider: "lmstudio",
				type: "fim",
				apiKey: apiKey as string,
				fimTemplate: "deepseek",
			}
		}
	}

	public setAcceptedLastCompletion(value: boolean) {
		this._acceptedLastCompletion = value
		this._lastCompletionMultiline = getLineBreakCount(this._completion) > 1
	}

	public abortCompletion() {
		this._abortController?.abort()
		this._statusBar.text = `${this._autoSuggestEnabled ? "$(check)" : "$(circle-slash)"} AI×Coding`
	}

	private logCompletion(formattedCompletion: string) {
		this._logger.log(
			`
      *** Twinny completion triggered for file: ${this._document?.uri} ***
      Original completion: ${this._completion}
      Formatted completion: ${formattedCompletion}
      Max Lines: ${this._maxLines}
      Use file context: ${this._fileContextEnabled}
      Completed lines count ${getLineBreakCount(formattedCompletion)}
      Using custom FIM template fim.bhs?: ${this._usingFimTemplate}
    `.trim(),
		)
	}

	private provideInlineCompletion(): InlineCompletionItem[] {
		const editor = window.activeTextEditor
		if (!editor || !this._position) return []
		const formattedCompletion = new CompletionFormatter(editor).format(this.removeStopWords(this._completion))

		this.logCompletion(formattedCompletion)

		if (this._completionCacheEnabled) cache.setCache(this._prefixSuffix, formattedCompletion)

		this._completion = ""
		this._statusBar.text = "$(check) AI×Coding"
		this.lastCompletionText = formattedCompletion
		this._lastCompletionMultiline = getLineBreakCount(formattedCompletion) > 1
		return [new InlineCompletionItem(formattedCompletion, new Range(this._position, this._position))]
	}

	public updateConfig() {
		this._autoSuggestEnabled = this._extensionContext.globalState.get("enableCompletion", false)
	}
}
