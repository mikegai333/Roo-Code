// /*---------------------------------------------------------------------------------------------
//  *  Copyright (c) Microsoft Corporation. All rights reserved.
//  *  Licensed under the MIT License. See License.txt in the project root for license information.
//  *--------------------------------------------------------------------------------------------*/

// import { CancellationToken, Command, InlineCompletionContext, InlineCompletionDisplayLocation, InlineCompletionEndOfLifeReason, InlineCompletionEndOfLifeReasonKind, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, InlineCompletionsDisposeReason, Position, Range, TextDocument, l10n } from 'vscode';
// import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
// import { InlineEditRequestLogContext } from '../../../platform/inlineEdits/common/inlineEditLogContext';
// import { ShowNextEditPreference } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
// import { CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
// import { Event } from '../../../util/vs/base/common/event';
// import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
// // import { DiagnosticsTelemetryBuilder } from '../node/nextEditProviderTelemetry';
// import { toExternalRange } from './features/diagnosticsBasedCompletions/diagnosticsCompletions';
// import { DiagnosticsNextEditResult, INextEditProvider } from './features/diagnosticsInlineEditProvider';
// // import { InlineEditModel } from './inlineEditModel';

// export interface NesCompletionItem extends InlineCompletionItem {
// 	readonly info: NesCompletionInfo;
// 	wasShown: boolean;
// }

// class NesCompletionList extends InlineCompletionList {
// 	public override enableForwardStability = true;

// 	constructor(
// 		public readonly requestUuid: string,
// 		item: NesCompletionItem | undefined,
// 		public override readonly commands: Command[],
// 	) {
// 		super(item === undefined ? [] : [item]);
// 	}
// }

// abstract class BaseNesCompletionInfo<T extends INextEditResult> {
// 	public abstract source: string;

// 	constructor(
// 		public readonly suggestion: T,
// 		public readonly documentId: DocumentId,
// 		public readonly document: TextDocument,
// 		public readonly requestUuid: string
// 	) { }
// }

// class DiagnosticsCompletionInfo extends BaseNesCompletionInfo<DiagnosticsNextEditResult> {
// 	public readonly source = 'diagnostics';
// }

// type NesCompletionInfo = DiagnosticsCompletionInfo;

// export class DiagnosticsCompletionProvider {
// 	public readonly displayName = 'DiagnosticsCompletionProvider';

// 	public readonly onDidChange: Event<void> | undefined;

// 	constructor(
// 		private diagnosticsProvider: INextEditProvider<DiagnosticsNextEditResult, boolean>
// 	) {
// 		// this.onDidChange = Event.fromObservableLight(this.model.onChange);
// 	}

// 	public async provideDiagnosticsCompletionItems(
// 		document: TextDocument,
// 		position: Position,
// 		context: InlineCompletionContext,
// 		token: CancellationToken
// 	): Promise<NesCompletionList | undefined> {
// 		// const isInlineEditsEnabled = true; // 简化配置，默认启用

// 		const doc = this.model.workspace.getDocumentByTextDocument(document);
// 		if (!doc) {
// 			return undefined;
// 		}

// 		const requestCancellationTokenSource = new CancellationTokenSource(token);
// 		let suggestionInfo: NesCompletionInfo | undefined;

// 		try {
// 			// 只使用 diagnosticsBasedProvider
// 			let diagnosticsSuggestion = undefined;


// 			if (this.model.diagnosticsBasedProvider) {
// 				// 创建日志和遥测实例
// 				const logContext = new InlineEditRequestLogContext(doc.id.uri, document.version, context);
// 				// const telemetryBuilder = new DiagnosticsTelemetryBuilder();

// 				diagnosticsSuggestion = await this.model.diagnosticsBasedProvider.runUntilNextEdit(
// 					doc.id,
// 					context,
// 					logContext,
// 					50,
// 					requestCancellationTokenSource.token,
// 					// telemetryBuilder
// 				);
// 			}

// 			// 取消正在进行的请求
// 			// requestCancellationTokenSource.cancel(); // This line caused the suggestion provider to cancel immediately, so we comment it out.

// 			const emptyList = new NesCompletionList(context.requestUuid, undefined, []);

// 			if (token.isCancellationRequested) {
// 				return emptyList;
// 			}

// 			// 只使用 diagnosticsBasedProvider 的建议
// 			if (diagnosticsSuggestion?.result) {
// 				suggestionInfo = new DiagnosticsCompletionInfo(diagnosticsSuggestion, doc.id, document, context.requestUuid);
// 			} else {
// 				return emptyList;
// 			}

// 			// 返回并发送遥测如果没有结果
// 			const result = suggestionInfo.suggestion.result;
// 			if (!result) {
// 				return emptyList;
// 			}

// 			const range = documentRangeFromOffsetRange(document, result.edit.replaceRange);

// 			// 只在光标距离编辑最多4行时显示编辑
// 			const showRange = (
// 				result.showRangePreference === ShowNextEditPreference.AroundEdit
// 					? new Range(
// 						Math.max(range.start.line - 4, 0),
// 						0,
// 						range.end.line + 4,
// 						Number.MAX_SAFE_INTEGER
// 					)
// 					: undefined
// 			);

// 			const displayLocation: InlineCompletionDisplayLocation | undefined = result.displayLocation ? {
// 				range: toExternalRange(result.displayLocation.range),
// 				label: result.displayLocation.label
// 			} : undefined;

// 			const learnMoreAction: Command = {
// 				title: l10n.t('Learn More'),
// 				command: 'inlineEdit.learnMore',
// 				tooltip: 'https://example.com/learn-more'
// 			};

// 			// const allowInlineCompletions = true; // 简化配置，默认启用
// 			// const isInlineCompletion = allowInlineCompletions && isInlineSuggestion(position, document, range, result.edit.newText);

// 			const inlineEdit: NesCompletionItem = {
// 				range,
// 				insertText: result.edit.newText,
// 				showRange,
// 				action: learnMoreAction,
// 				info: suggestionInfo,
// 				isInlineEdit: true,
// 				showInlineEditMenu: true,
// 				displayLocation,
// 				wasShown: false,
// 			};

// 			return new NesCompletionList(context.requestUuid, inlineEdit, []);
// 		} catch (e) {
// 			throw e;
// 		} finally {
// 			requestCancellationTokenSource.dispose();
// 		}
// 	}

// 	public handleDidShowCompletionItem(completionItem: NesCompletionItem): void {
// 		completionItem.wasShown = true;

// 		const info = completionItem.info;
// 		this.model.diagnosticsBasedProvider?.handleShown(info.suggestion);
// 	}

// 	public handleListEndOfLifetime(list: NesCompletionList, reason: InlineCompletionsDisposeReason): void {
// 		// 简化版本不需要处理列表生命周期结束
// 	}

// 	public handleEndOfLifetime(item: NesCompletionItem, reason: InlineCompletionEndOfLifeReason): void {
// 		switch (reason.kind) {
// 			case InlineCompletionEndOfLifeReasonKind.Accepted: {
// 				this._handleAcceptance(item);
// 				break;
// 			}
// 			case InlineCompletionEndOfLifeReasonKind.Rejected: {
// 				this._handleDidRejectCompletionItem(item);
// 				break;
// 			}
// 			case InlineCompletionEndOfLifeReasonKind.Ignored: {
// 				const supersededBy = reason.supersededBy ? (reason.supersededBy as NesCompletionItem) : undefined;
// 				this._handleDidIgnoreCompletionItem(item, supersededBy);
// 				break;
// 			}
// 		}
// 	}

// 	private _handleAcceptance(item: NesCompletionItem): void {
// 		const info = item.info;
// 		this.model.diagnosticsBasedProvider?.handleAcceptance(info.documentId, info.suggestion);
// 	}

// 	private _handleDidRejectCompletionItem(completionItem: NesCompletionItem): void {
// 		const info = completionItem.info;
// 		this.model.diagnosticsBasedProvider?.handleRejection(info.documentId, info.suggestion);
// 	}

// 	private _handleDidIgnoreCompletionItem(item: NesCompletionItem, supersededBy?: NesCompletionItem): void {
// 		const info = item.info;
// 		const supersededBySuggestion = supersededBy ? supersededBy.info.suggestion : undefined;
// 		this.model.diagnosticsBasedProvider?.handleIgnored(info.documentId, info.suggestion, supersededBySuggestion);
// 	}
// }

// function documentRangeFromOffsetRange(doc: TextDocument, range: OffsetRange): Range {
// 	return new Range(
// 		doc.positionAt(range.start),
// 		doc.positionAt(range.endExclusive)
// 	);
// }

// // 需要的接口定义
// interface INextEditResult {
// 	readonly requestId: number;
// 	readonly result?: {
// 		edit: any; // Allow any edit type for simplification
// 		displayLocation?: INextEditDisplayLocation;
// 		showRangePreference?: ShowNextEditPreference;
// 	};
// }

// interface INextEditDisplayLocation {
// 	range: any;
// 	label: string;
// }