/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

// Here we add an artifical `__vscodeBrand` to types with names which appear both
// in the vscode API and in this project. This helps ensure that we depend
// on the correct types in the code which interacts with the vscode API.
declare module 'vscode' {
	export interface MarkdownString { __vscodeBrand: undefined }
	export interface Position { __vscodeBrand: undefined }
	export interface Range { __vscodeBrand: undefined }
	export interface Selection { __vscodeBrand: undefined }
	export interface TextEdit { __vscodeBrand: undefined }
}

export import Position = vscode.Position;
export import Range = vscode.Range;
export import Selection = vscode.Selection;
export import EventEmitter = vscode.EventEmitter;
export import CancellationTokenSource = vscode.CancellationTokenSource;
export import Diagnostic = vscode.Diagnostic;
export import TextEdit = vscode.TextEdit;
export import WorkspaceEdit = vscode.WorkspaceEdit;
export import Uri = vscode.Uri;
export import MarkdownString = vscode.MarkdownString;
export import TextEditorCursorStyle = vscode.TextEditorCursorStyle;
export import TextEditorLineNumbersStyle = vscode.TextEditorLineNumbersStyle;
export import TextEditorRevealType = vscode.TextEditorRevealType;
export import EndOfLine = vscode.EndOfLine;
export import DiagnosticSeverity = vscode.DiagnosticSeverity;
export import ExtensionMode = vscode.ExtensionMode;
export import Location = vscode.Location;
export import DiagnosticRelatedInformation = vscode.DiagnosticRelatedInformation;
export import ChatVariableLevel = vscode.ChatVariableLevel;
export import ChatResponseMarkdownPart = vscode.ChatResponseMarkdownPart;
export import ChatResponseFileTreePart = vscode.ChatResponseFileTreePart;
export import ChatResponseAnchorPart = vscode.ChatResponseAnchorPart;
export import ChatResponseProgressPart = vscode.ChatResponseProgressPart;
export import ChatResponseProgressPart2 = vscode.ChatResponseProgressPart2;
export import ChatResponseReferencePart = vscode.ChatResponseReferencePart;
export import ChatResponseReferencePart2 = vscode.ChatResponseReferencePart2;
export import ChatResponseCodeCitationPart = vscode.ChatResponseCodeCitationPart;
export import ChatResponseCommandButtonPart = vscode.ChatResponseCommandButtonPart;
export import ChatResponseWarningPart = vscode.ChatResponseWarningPart;
export import ChatResponseMovePart = vscode.ChatResponseMovePart;
export import ChatResponseExtensionsPart = vscode.ChatResponseExtensionsPart;
export import ChatResponseMarkdownWithVulnerabilitiesPart = vscode.ChatResponseMarkdownWithVulnerabilitiesPart;
export import ChatResponseCodeblockUriPart = vscode.ChatResponseCodeblockUriPart;
export import ChatResponseTextEditPart = vscode.ChatResponseTextEditPart;
export import ChatResponseNotebookEditPart = vscode.ChatResponseNotebookEditPart;
export import ChatResponseConfirmationPart = vscode.ChatResponseConfirmationPart;
export import ChatPrepareToolInvocationPart = vscode.ChatPrepareToolInvocationPart;
export type ChatRequest = vscode.ChatRequest;
export type ChatRequestTurn = vscode.ChatRequestTurn;
export type ChatResponseTurn = vscode.ChatResponseTurn;
export type NewSymbolName = vscode.NewSymbolName;
export type NewSymbolNameTag = vscode.NewSymbolNameTag;
export type NewSymbolNameTriggerKind = vscode.NewSymbolNameTriggerKind;
export type ChatLocation = vscode.ChatLocation;
export type ChatRequestEditorData = vscode.ChatRequestEditorData;
export type ChatRequestNotebookData = vscode.ChatRequestNotebookData;
export type LanguageModelToolInformation = vscode.LanguageModelToolInformation;
export type LanguageModelToolResult = vscode.LanguageModelToolResult;
export type ExtendedLanguageModelToolResult = vscode.ExtendedLanguageModelToolResult;
export type LanguageModelToolResult2 = vscode.LanguageModelToolResult2;
export type SymbolInformation = vscode.SymbolInformation;
export type LanguageModelPromptTsxPart = vscode.LanguageModelPromptTsxPart;
export type LanguageModelTextPart = vscode.LanguageModelTextPart;
export type LanguageModelDataPart = vscode.LanguageModelDataPart;
export type ChatImageMimeType = vscode.ChatImageMimeType;
export type ChatReferenceBinaryData = vscode.ChatReferenceBinaryData;
export type ChatReferenceDiagnostic = vscode.ChatReferenceDiagnostic;
export type TextSearchMatch2 = vscode.TextSearchMatch2;
export type AISearchKeyword = vscode.AISearchKeyword;
export type ExcludeSettingOptions = vscode.ExcludeSettingOptions;
export type NotebookCellKind = vscode.NotebookCellKind;
export type NotebookRange = vscode.NotebookRange;
export type NotebookEdit = vscode.NotebookEdit;
export type NotebookCellData = vscode.NotebookCellData;
export type NotebookData = vscode.NotebookData;
export type PreparedTerminalToolInvocation = vscode.PreparedTerminalToolInvocation;
export type ChatErrorLevel = vscode.ChatErrorLevel;
export type TerminalShellExecutionCommandLineConfidence = vscode.TerminalShellExecutionCommandLineConfidence;
export type ChatRequestEditedFileEventKind = vscode.ChatRequestEditedFileEventKind;
export type Extension = vscode.Extension<any>;

export const l10n = {
	/**
	 * @deprecated Only use this import in tests. For the actual extension,
	 * use `import { l10n } from 'vscode'` or `import * as l10n from '@vscode/l10n'`.
	 */
	t: vscode.l10n.t
};
