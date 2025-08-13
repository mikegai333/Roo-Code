/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode"
import { DocumentId } from "../../../../platform/inlineEdits/common/dataTypes/documentId"
import { InlineEditRequestLogContext } from "../../../../platform/inlineEdits/common/inlineEditLogContext"
import { ObservableGit } from "../../../../platform/inlineEdits/common/observableGit"
import { ShowNextEditPreference } from "../../../../platform/inlineEdits/common/statelessNextEditProvider"
import { timeout } from "../../../../util/vs/base/common/async"
import { CancellationToken } from "../../../../util/vs/base/common/cancellation"
import { BugIndicatingError } from "../../../../util/vs/base/common/errors"
import { Disposable } from "../../../../util/vs/base/common/lifecycle"
import { StringReplacement } from "../../../../util/vs/editor/common/core/edits/stringEdit"
import { IInstantiationService } from "../../../../util/vs/platform/instantiation/common/instantiation"
import { INextEditDisplayLocation, INextEditResult } from "../../node/nextEditResult"
import { VSCodeWorkspace } from "../parts/vscodeWorkspace"
import { DiagnosticCompletionItem } from "./diagnosticsBasedCompletions/diagnosticsCompletions"
import { DiagnosticCompletionState, DiagnosticsCompletionProcessor } from "./diagnosticsCompletionProcessor"

export class DiagnosticsNextEditResult implements INextEditResult {
	constructor(
		public readonly requestId: number,
		public readonly result:
			| {
					edit: StringReplacement
					displayLocation?: INextEditDisplayLocation
					item: DiagnosticCompletionItem
					showRangePreference?: ShowNextEditPreference
			  }
			| undefined,
	) {}
}
export interface IDisposable {
	dispose(): void
}
export interface INextEditProvider<T extends INextEditResult, TData = void> extends IDisposable {
	[x: string]: any
	readonly ID: string
	getNextEdit(
		docId: DocumentId,
		context: vscode.InlineCompletionContext,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
	): Promise<T>
	handleShown(suggestion: T): void
	handleAcceptance(docId: DocumentId, suggestion: T): void
	handleRejection(docId: DocumentId, suggestion: T): void
	handleIgnored(docId: DocumentId, suggestion: T, supersededByRequestUuid: INextEditResult | undefined): void
	lastRejectionTime: number
	lastTriggerTime: number
}

export class DiagnosticsNextEditProvider
	extends Disposable
	implements INextEditProvider<DiagnosticsNextEditResult, boolean>
{
	public readonly ID = "DiagnosticsNextEditProvider"

	private _lastRejectionTime: number = 0
	public get lastRejectionTime(): number {
		return this._lastRejectionTime
	}

	private _lastTriggerTime: number = 0
	public get lastTriggerTime(): number {
		return this._lastTriggerTime
	}

	private readonly _diagnosticsCompletionHandler: DiagnosticsCompletionProcessor

	constructor(
		workspace: VSCodeWorkspace,
		git: ObservableGit,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super()

		this._diagnosticsCompletionHandler = this._register(
			instantiationService.createInstance(DiagnosticsCompletionProcessor, workspace, git),
		)
	}

	async getNextEdit(
		docId: DocumentId,
		context: vscode.InlineCompletionContext,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
	): Promise<DiagnosticsNextEditResult> {
		this._lastTriggerTime = Date.now()

		if (cancellationToken.isCancellationRequested) {
			return new DiagnosticsNextEditResult(logContext.requestId, undefined)
		}

		let diagnosticEditResult = this._diagnosticsCompletionHandler.getCurrentState(docId)
		if (!diagnosticEditResult.item) {
			diagnosticEditResult = await this._diagnosticsCompletionHandler.getNextUpdatedState(
				docId,
				cancellationToken,
			)
		}

		return this._createNextEditResult(diagnosticEditResult, logContext)
	}

	async runUntilNextEdit(
		docId: DocumentId,
		context: vscode.InlineCompletionContext,
		logContext: InlineEditRequestLogContext,
		delayStart: number,
		cancellationToken: CancellationToken,
	): Promise<DiagnosticsNextEditResult> {
		try {
			await timeout(delayStart)
			if (cancellationToken.isCancellationRequested) {
				return new DiagnosticsNextEditResult(logContext.requestId, undefined)
			}

			// Check if the last computed edit is still valid
			let completionResult = this._diagnosticsCompletionHandler.getCurrentState(docId)
			let diagnosticEditResult = this._createNextEditResult(completionResult, logContext)

			// If the last computed edit is not valid, wait until the state is updated or the operation is cancelled
			while (!diagnosticEditResult.result && !cancellationToken.isCancellationRequested) {
				completionResult = await this._diagnosticsCompletionHandler.getNextUpdatedState(
					docId,
					cancellationToken,
				)
				diagnosticEditResult = this._createNextEditResult(completionResult, logContext)
			}

			// TODO: Better incorporate diagnostics logging
			if (completionResult.logContext) {
				completionResult.logContext.getLogs().forEach((log) => logContext.addLog(log))
			}

			return diagnosticEditResult
		} catch (error) {
			return new DiagnosticsNextEditResult(logContext.requestId, undefined)
		}
	}

	private _createNextEditResult(
		diagnosticEditResult: DiagnosticCompletionState,
		logContext: InlineEditRequestLogContext,
	): DiagnosticsNextEditResult {
		const { item } = diagnosticEditResult

		// Diagnostics might not have updated yet since accepting a diagnostics based NES
		if (item && this._hasRecentlyBeenAccepted(item)) {
			return new DiagnosticsNextEditResult(logContext.requestId, undefined)
		}

		if (!item) {
			return new DiagnosticsNextEditResult(logContext.requestId, undefined)
		}

		logContext.setDiagnosticsResult(item.getRootedLineEdit())

		return new DiagnosticsNextEditResult(logContext.requestId, {
			edit: item.toOffsetEdit(),
			displayLocation: item.nextEditDisplayLocation,
			item,
		})
	}

	handleShown(suggestion: DiagnosticsNextEditResult): void {}

	handleAcceptance(docId: DocumentId, suggestion: DiagnosticsNextEditResult): void {
		const completionResult = suggestion.result
		if (!completionResult) {
			throw new BugIndicatingError("Completion result is undefined when accepted")
		}

		this._lastAcceptedItem = { item: completionResult.item, time: Date.now() }
		this._diagnosticsCompletionHandler.handleEndOfLifetime(completionResult.item, {
			kind: vscode.InlineCompletionEndOfLifeReasonKind.Accepted,
		})
	}

	private _lastAcceptedItem: { item: DiagnosticCompletionItem; time: number } | undefined = undefined
	private _hasRecentlyBeenAccepted(item: DiagnosticCompletionItem): boolean {
		if (!this._lastAcceptedItem) {
			return false
		}

		if (Date.now() - this._lastAcceptedItem.time >= 1000) {
			return false
		}

		return (
			item.diagnostic.equals(this._lastAcceptedItem.item.diagnostic) ||
			DiagnosticCompletionItem.equals(this._lastAcceptedItem.item, item)
		)
	}

	handleRejection(docId: DocumentId, suggestion: DiagnosticsNextEditResult): void {
		this._lastRejectionTime = Date.now()

		const completionResult = suggestion.result
		if (!completionResult) {
			throw new BugIndicatingError("Completion result is undefined when rejected")
		}

		this._diagnosticsCompletionHandler.handleEndOfLifetime(completionResult.item, {
			kind: vscode.InlineCompletionEndOfLifeReasonKind.Rejected,
		})
	}

	handleIgnored(
		docId: DocumentId,
		suggestion: DiagnosticsNextEditResult,
		supersededBy: INextEditResult | undefined,
	): void {
		const completionResult = suggestion.result
		if (!completionResult) {
			throw new BugIndicatingError("Completion result is undefined when accepted")
		}

		const supersededByItem =
			supersededBy instanceof DiagnosticsNextEditResult ? supersededBy?.result?.item : undefined

		this._diagnosticsCompletionHandler.handleEndOfLifetime(completionResult.item, {
			kind: vscode.InlineCompletionEndOfLifeReasonKind.Ignored,
			supersededBy: supersededByItem,
			userTypingDisagreed: false /* TODO: Adopt this*/,
		})
	}
}
