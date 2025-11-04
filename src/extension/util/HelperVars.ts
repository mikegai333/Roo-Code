import { TextDocument } from "vscode"
import { IdeInfo, TabAutocompleteOptions } from "."
import { AstPath, getAst, getTreePathAtCursor } from "./ast"
import { PrefixSuffix } from "../../common/types"
import { AutocompleteLanguageInfo, languageForFilepath } from "../snippets/constants/AutocompleteLanguageInfo"
import { VsCodeIde } from "./VsCodeIde"

export class HelperVars {
	lang: AutocompleteLanguageInfo
	treePath: AstPath | undefined
	workspaceUris: string[] = []
	ideInfo: IdeInfo | undefined

	private _fileContents: string | undefined
	private _fileLines: string[] | undefined
	private _fullPrefix: string | undefined
	private _fullSuffix: string | undefined
	private _prunedPrefix: string | undefined
	private _prunedSuffix: string | undefined

	private constructor(
		//   public readonly input: AutocompleteInput,
		public readonly options: TabAutocompleteOptions,
		public readonly modelName: string,
		private readonly ide: VsCodeIde,
		private readonly document: TextDocument,
		private readonly prefixSuffix: PrefixSuffix,
	) {
		this.lang = languageForFilepath(this.filepath, this.document)
	}

	static async create(
		// input: AutocompleteInput,
		prefixSuffix: PrefixSuffix,
		document: TextDocument,
		ide: VsCodeIde,
		options: TabAutocompleteOptions,
		modelName: string,
	): Promise<HelperVars> {
		const instance = new HelperVars(options, modelName, ide, document, prefixSuffix)
		await instance.init()
		return instance
	}

	private async init() {
		// Don't do anything if already initialized
		// if (this._fileContents !== undefined) {
		//   return;
		// }
		// this.ideInfo = await this.ide.getIdeInfo();
		// this.workspaceUris = await this.ide.getWorkspaceDirs();

		// this._fileContents =
		//   this.input.manuallyPassFileContents ??
		//   (await this.ide.readFile(this.filepath));

		// this._fileLines = this._fileContents.split("\n");

		// // Construct full prefix/suffix (a few edge cases handled in here)
		const { prefix, suffix } = this.prefixSuffix
		this._fullPrefix = prefix
		this._fullSuffix = suffix

		// const { prunedPrefix, prunedSuffix } = this.prunePrefixSuffix();
		// this._prunedPrefix = prunedPrefix;
		// this._prunedSuffix = prunedSuffix;

		try {
			const { prefix, suffix } = this.prefixSuffix
			const ast = await getAst(this.filepath, prefix + suffix)
			if (ast) {
				this.treePath = await getTreePathAtCursor(ast, prefix.length)
			}
		} catch (e) {
			console.error("Failed to parse AST", e)
		}
	}

	get filepath() {
		return this.document.uri.fsPath
	}
	get isUntitled() {
		return this.document.isUntitled
	}
	get fullPrefix(): string {
		if (this._fullPrefix === undefined) {
			throw new Error("HelperVars must be initialized before accessing fullPrefix")
		}
		return this._fullPrefix
	}

	get fullSuffix(): string {
		if (this._fullSuffix === undefined) {
			throw new Error("HelperVars must be initialized before accessing fullSuffix")
		}
		return this._fullSuffix
	}
	get prunedCaretWindow() {
		return this._fullPrefix || "" + this._fullSuffix
	}
}
