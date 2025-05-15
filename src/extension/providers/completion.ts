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
import { getConfig } from "../../lint"

export class CompletionProvider implements InlineCompletionItemProvider {
	private _config = workspace.getConfiguration("aixcoding.main.config")
	private _abortController: AbortController | null
	private _acceptedLastCompletion = false
	private _completionCacheEnabled = false
	private _chunkCount = 0
	private _completion = ""
	private _nodeAtPosition: SyntaxNode | null = null
	private _debouncer: NodeJS.Timeout | undefined
	private _debounceWait = 750 as number
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

	constructor(
		statusBar: StatusBarItem,
		fileInteractionCache: FileInteractionCache,
		templateProvider: TemplateProvider,
		extentionContext: ExtensionContext,
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
	}

	public async provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext,
	): Promise<InlineCompletionItem[] | InlineCompletionList | null | undefined> {
		this._isAborted = false
		const editor = window.activeTextEditor

		const isLastCompletionAccepted = this._acceptedLastCompletion && !this.enableSubsequentCompletions

		this._prefixSuffix = getPrefixSuffix(this._numLineContext, document, position)
		const cachedCompletion = cache.getCache(this._prefixSuffix)
		if (cachedCompletion && this._completionCacheEnabled) {
			this._completion = cachedCompletion
			return this.provideInlineCompletion()
		}

		if (context.triggerKind === InlineCompletionTriggerKind.Invoke && this._autoSuggestEnabled) {
			this._completion = this.lastCompletionText
			return this.provideInlineCompletion()
		}
		if (
			!this._enabled ||
			!editor ||
			isLastCompletionAccepted ||
			this._lastCompletionMultiline ||
			getShouldSkipCompletion(context, this._autoSuggestEnabled) ||
			getIsMiddleOfString() ||
			!triggerCompletion()
		) {
			// this._statusBar.text = "$(check) AI×Coding";
			return
		}

		this._chunkCount = 0
		this._document = document
		this._position = position
		this._nonce = this._nonce + 1
		this._statusBar.text = "$(loading~spin) AI×Coding"
		// this._statusBar.command = "aixcoding.stopCompletion";

		this._parser = await getParser(document.uri.fsPath)
		try {
			if (this._document && this._parser) {
				const text = this._document.getText()
				const tree = this._parser.parse(text)
				this._nodeAtPosition = getNodeAtPosition(tree, this._position)
			} else {
				console.error("Document or parser is not properly initialized.")
			}
		} catch (error) {
			console.error("Parsing failed:", error)
		}
		// this._nodeAtPosition = getNodeAtPosition(
		//   this._parser?.parse(this._document?.getText()),
		//   this._position
		// )

		this._isMultilineCompletion = getIsMultilineCompletion({
			node: this._nodeAtPosition,
			prefixSuffix: this._prefixSuffix,
		})
		if (this._debouncer) clearTimeout(this._debouncer)

		const prompt = await this.getPrompt(this._prefixSuffix)
		if (!prompt) return

		return new Promise<ResolvedInlineCompletion>((resolve, reject) => {
			this._debouncer = setTimeout(() => {
				this._lock.acquire("twinny.completion", async () => {
					const provider = this.getProvider()
					if (!provider) return
					const request = this.buildStreamRequest(prompt, provider)
					let newTelemetry = { ...telemetry, requestId: uuidv4() }
					let requestBody = { ...request.body, telemetry: newTelemetry }
					this._requestId = newTelemetry.requestId
					try {
						await streamResponse({
							body: requestBody,
							options: request.options,
							onStart: (controller) => (this._abortController = controller),
							onEnd: () => this.onEnd(resolve),
							onError: this.onError,
							onData: (data) => {
								if (this._isAborted) {
									this._abortController?.abort()
									console.log("Data received after abort, but will not process.")
									return
								}
								let completion = this.onData(data)
								console.log("ondata", completion, this._abortController)
								if (completion) {
									this._abortController?.abort()
									this._isAborted = true // 设置中断标志
									console.log("aborted fired", Date.now())
								}
							},
						})
					} catch (error) {
						this.onError()
						reject([])
					}
				})
			}, this._debounceWait)
		})
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
				!this._multilineCompletionsEnabled &&
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
				// this._completion = this._completion.substring(0, lastLineBreakIndex);
				return this._completion
			}

			const isMultilineCompletionRequired =
				!this._isMultilineCompletion &&
				this._multilineCompletionsEnabled &&
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
				this._logger.log(
					`
            Streaming response end due to max line count ${this._nonce} \nCompletion: ${this._completion}
          `,
				)
				return this._completion
			}

			return ""
		} catch (e) {
			return ""
		}
	}

	private onEnd(resolve: (completion: ResolvedInlineCompletion) => void) {
		return resolve(this.provideInlineCompletion())
	}

	public onError = () => {
		this._abortController?.abort()
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
		return filteredCompletion
	}

	private async getPrompt(prefixSuffix: PrefixSuffix) {
		const provider = this.getProvider()
		if (!provider) return ""
		if (!this._document || !this._position || !provider) return ""

		const documentLanguage = this._document.languageId
		const fileInteractionContext = await this.getFileInteractionContext()

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

		return getFimPrompt(provider.modelName, provider.fimTemplate || FIM_TEMPLATE_FORMAT.automatic, {
			context: fileInteractionContext || "",
			prefixSuffix,
			header: this.getPromptHeader(documentLanguage, this._document.uri),
			fileContextEnabled: this._fileContextEnabled,
			language: documentLanguage,
		})
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

	public reportAccept() {
		const apiUrl = `${this._config.get("apiBaseUrl")}/api/v1/completions/feedback`
		fetch(apiUrl, {
			method: "POST", // 或 'PUT'
			headers: {
				"Content-Type": "application/json",
				Token: this._config.get("apiKey") || "",
			},
			body: JSON.stringify({
				requestId: this._requestId,
				status: 202,
			}),
		})
			.then((response) => response.json())
			.then((data) => console.log("Success:", data))
			.catch((error) => console.error("Error:", error))
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
		this._lastCompletionMultiline = getLineBreakCount(this._completion) > 1

		return [new InlineCompletionItem(formattedCompletion, new Range(this._position, this._position))]
	}

	public updateConfig() {
		this._autoSuggestEnabled = this._extensionContext.globalState.get("enableCompletion", false)
	}
}
