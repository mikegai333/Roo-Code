import React, { useState, useEffect, useMemo, useCallback } from "react"
import {
	VSCodeButton,
	VSCodeTextArea,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextField,
	VSCodeCheckbox,
} from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import {
	Mode,
	PromptComponent,
	getRoleDefinition,
	getCustomInstructions,
	getAllModes,
	ModeConfig,
	GroupEntry,
} from "../../../../src/shared/modes"
import {
	supportPrompt,
	SupportPromptType,
	supportPromptLabels,
	supportPromptDescriptions,
} from "../../../../src/shared/support-prompt"

import { TOOL_GROUPS, GROUP_DISPLAY_NAMES, ToolGroup } from "../../../../src/shared/tool-groups"
import { vscode } from "../../utils/vscode"

// Get all available groups that should show in prompts view
const availableGroups = (Object.keys(TOOL_GROUPS) as ToolGroup[]).filter((group) => !TOOL_GROUPS[group].alwaysAvailable)

type PromptsViewProps = {
	onDone: () => void
}

// Helper to get group name regardless of format
function getGroupName(group: GroupEntry): ToolGroup {
	return Array.isArray(group) ? group[0] : group
}

const PromptsView = ({ onDone }: PromptsViewProps) => {
	const {
		customModePrompts,
		customSupportPrompts,
		listApiConfigMeta,
		currentApiConfigName,
		enhancementApiConfigId,
		setEnhancementApiConfigId,
		mode,
		customInstructions,
		setCustomInstructions,
		preferredLanguage,
		setPreferredLanguage,
		customModes,
	} = useExtensionState()

	// Memoize modes to preserve array order
	const modes = useMemo(() => getAllModes(customModes), [customModes])

	const [testPrompt, setTestPrompt] = useState("")
	const [isEnhancing, setIsEnhancing] = useState(false)
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [selectedPromptContent, setSelectedPromptContent] = useState("")
	const [selectedPromptTitle, setSelectedPromptTitle] = useState("")
	const [isToolsEditMode, setIsToolsEditMode] = useState(false)
	const [isCreateModeDialogOpen, setIsCreateModeDialogOpen] = useState(false)
	const [activeSupportTab, setActiveSupportTab] = useState<SupportPromptType>("ENHANCE")

	// Direct update functions
	const updateAgentPrompt = useCallback(
		(mode: Mode, promptData: PromptComponent) => {
			const existingPrompt = customModePrompts?.[mode] as PromptComponent
			const updatedPrompt = { ...existingPrompt, ...promptData }

			// Only include properties that differ from defaults
			if (updatedPrompt.roleDefinition === getRoleDefinition(mode)) {
				delete updatedPrompt.roleDefinition
			}

			vscode.postMessage({
				type: "updatePrompt",
				promptMode: mode,
				customPrompt: updatedPrompt,
			})
		},
		[customModePrompts],
	)

	const updateCustomMode = useCallback((slug: string, modeConfig: ModeConfig) => {
		vscode.postMessage({
			type: "updateCustomMode",
			slug,
			modeConfig,
		})
	}, [])

	// Helper function to find a mode by slug
	const findModeBySlug = useCallback(
		(searchSlug: string, modes: readonly ModeConfig[] | undefined): ModeConfig | undefined => {
			if (!modes) return undefined
			const isModeWithSlug = (mode: ModeConfig): mode is ModeConfig => mode.slug === searchSlug
			return modes.find(isModeWithSlug)
		},
		[],
	)

	const switchMode = useCallback((slug: string) => {
		vscode.postMessage({
			type: "mode",
			text: slug,
		})
	}, [])

	// Handle mode switching with explicit state initialization
	const handleModeSwitch = useCallback(
		(modeConfig: ModeConfig) => {
			if (modeConfig.slug === mode) return // Prevent unnecessary updates

			// First switch the mode
			switchMode(modeConfig.slug)

			// Exit tools edit mode when switching modes
			setIsToolsEditMode(false)
		},
		[mode, switchMode, setIsToolsEditMode],
	)

	// Helper function to get current mode's config
	const getCurrentMode = useCallback((): ModeConfig | undefined => {
		const findMode = (m: ModeConfig): boolean => m.slug === mode
		return customModes?.find(findMode) || modes.find(findMode)
	}, [mode, customModes, modes])

	// Helper function to safely access mode properties
	const getModeProperty = <T extends keyof ModeConfig>(
		mode: ModeConfig | undefined,
		property: T,
	): ModeConfig[T] | undefined => {
		return mode?.[property]
	}

	// State for create mode dialog
	const [newModeName, setNewModeName] = useState("")
	const [newModeSlug, setNewModeSlug] = useState("")
	const [newModeRoleDefinition, setNewModeRoleDefinition] = useState("")
	const [newModeCustomInstructions, setNewModeCustomInstructions] = useState("")
	const [newModeGroups, setNewModeGroups] = useState<GroupEntry[]>(availableGroups)

	// Reset form fields when dialog opens
	useEffect(() => {
		if (isCreateModeDialogOpen) {
			setNewModeGroups(availableGroups)
			setNewModeRoleDefinition("")
			setNewModeCustomInstructions("")
		}
	}, [isCreateModeDialogOpen])

	// Helper function to generate a unique slug from a name
	const generateSlug = useCallback((name: string, attempt = 0): string => {
		const baseSlug = name
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/^-+|-+$/g, "")
		return attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
	}, [])

	// Handler for name changes
	const handleNameChange = useCallback(
		(name: string) => {
			setNewModeName(name)
			setNewModeSlug(generateSlug(name))
		},
		[generateSlug],
	)

	const handleCreateMode = useCallback(() => {
		if (!newModeName.trim() || !newModeSlug.trim()) return

		const newMode: ModeConfig = {
			slug: newModeSlug,
			name: newModeName,
			roleDefinition: newModeRoleDefinition.trim() || "",
			customInstructions: newModeCustomInstructions.trim() || undefined,
			groups: newModeGroups,
		}
		updateCustomMode(newModeSlug, newMode)
		switchMode(newModeSlug)
		setIsCreateModeDialogOpen(false)
		setNewModeName("")
		setNewModeSlug("")
		setNewModeRoleDefinition("")
		setNewModeCustomInstructions("")
		setNewModeGroups(availableGroups)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [newModeName, newModeSlug, newModeRoleDefinition, newModeCustomInstructions, newModeGroups, updateCustomMode])

	const isNameOrSlugTaken = useCallback(
		(name: string, slug: string) => {
			return modes.some((m) => m.slug === slug || m.name === name)
		},
		[modes],
	)

	const openCreateModeDialog = useCallback(() => {
		const baseNamePrefix = "New Custom Mode"
		// Find unique name and slug
		let attempt = 0
		let name = baseNamePrefix
		let slug = generateSlug(name)
		while (isNameOrSlugTaken(name, slug)) {
			attempt++
			name = `${baseNamePrefix} ${attempt + 1}`
			slug = generateSlug(name)
		}
		setNewModeName(name)
		setNewModeSlug(slug)
		setIsCreateModeDialogOpen(true)
	}, [generateSlug, isNameOrSlugTaken])

	// Handler for group checkbox changes
	const handleGroupChange = useCallback(
		(group: ToolGroup, isCustomMode: boolean, customMode: ModeConfig | undefined) =>
			(e: Event | React.FormEvent<HTMLElement>) => {
				if (!isCustomMode) return // Prevent changes to built-in modes
				const target = (e as CustomEvent)?.detail?.target || (e.target as HTMLInputElement)
				const checked = target.checked
				const oldGroups = customMode?.groups || []
				let newGroups: GroupEntry[]
				if (checked) {
					newGroups = [...oldGroups, group]
				} else {
					newGroups = oldGroups.filter((g) => getGroupName(g) !== group)
				}
				if (customMode) {
					updateCustomMode(customMode.slug, {
						...customMode,
						groups: newGroups,
					})
				}
			},
		[updateCustomMode],
	)

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "enhancedPrompt") {
				if (message.text) {
					setTestPrompt(message.text)
				}
				setIsEnhancing(false)
			} else if (message.type === "systemPrompt") {
				if (message.text) {
					setSelectedPromptContent(message.text)
					setSelectedPromptTitle(`System Prompt (${message.mode} mode)`)
					setIsDialogOpen(true)
				}
			}
		}

		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [])

	const updateSupportPrompt = (type: SupportPromptType, value: string | undefined) => {
		vscode.postMessage({
			type: "updateSupportPrompt",
			values: {
				[type]: value,
			},
		})
	}

	const handleAgentReset = (modeSlug: string, type: "roleDefinition" | "customInstructions") => {
		// Only reset for built-in modes
		const existingPrompt = customModePrompts?.[modeSlug] as PromptComponent
		const updatedPrompt = { ...existingPrompt }
		delete updatedPrompt[type] // Remove the field entirely to ensure it reloads from defaults

		vscode.postMessage({
			type: "updatePrompt",
			promptMode: modeSlug,
			customPrompt: updatedPrompt,
		})
	}

	const handleSupportReset = (type: SupportPromptType) => {
		vscode.postMessage({
			type: "resetSupportPrompt",
			text: type,
		})
	}

	const getSupportPromptValue = (type: SupportPromptType): string => {
		return supportPrompt.get(customSupportPrompts, type)
	}

	const handleTestEnhancement = () => {
		if (!testPrompt.trim()) return

		setIsEnhancing(true)
		vscode.postMessage({
			type: "enhancePrompt",
			text: testPrompt,
		})
	}

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				display: "flex",
				flexDirection: "column",
			}}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "10px 17px 10px 20px",
				}}>
				<h3 style={{ color: "var(--vscode-foreground)", margin: 0 }}>提示词</h3>
				<VSCodeButton onClick={onDone}>完成</VSCodeButton>
			</div>

			<div style={{ flex: 1, overflow: "auto", padding: "0 20px" }}>
				<div style={{ paddingBottom: "20px", borderBottom: "1px solid var(--vscode-input-border)" }}>
					<div style={{ marginBottom: "20px" }}>
						<div style={{ fontWeight: "bold", marginBottom: "4px" }}>首选语言</div>
						<select
							value={preferredLanguage}
							onChange={(e) => {
								setPreferredLanguage(e.target.value)
								vscode.postMessage({
									type: "preferredLanguage",
									text: e.target.value,
								})
							}}
							style={{
								width: "100%",
								padding: "4px 8px",
								backgroundColor: "var(--vscode-input-background)",
								color: "var(--vscode-input-foreground)",
								border: "1px solid var(--vscode-input-border)",
								borderRadius: "2px",
								height: "28px",
							}}>
							<option value="English">英语</option>
							<option value="Arabic">阿拉伯语 - العربية</option>
							<option value="Brazilian Portuguese">巴西葡萄牙语 - Português (Brasil)</option>
							<option value="Czech">捷克语 - Čeština</option>
							<option value="French">法语 - Français</option>
							<option value="German">德语 - Deutsch</option>
							<option value="Hindi">印地语 - हिन्दी</option>
							<option value="Hungarian">匈牙利语 - Magyar</option>
							<option value="Italian">意大利语 - Italiano</option>
							<option value="Japanese">日语 - 日本語</option>
							<option value="Korean">韩语 - 한국어</option>
							<option value="Polish">波兰语 - Polski</option>
							<option value="Portuguese">葡萄牙语 - Português (Portugal)</option>
							<option value="Russian">俄语 - Русский</option>
							<option value="Simplified Chinese">简体中文 - 简体中文</option>
							<option value="Spanish">西班牙语 - Español</option>
							<option value="Traditional Chinese">繁体中文 - 繁體中文</option>
							<option value="Turkish">土耳其语 - Türkçe</option>
						</select>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							选择和 AIxCoding 进行沟通时使用的语言。
						</p>
					</div>

					<div style={{ fontWeight: "bold", marginBottom: "4px" }}>所有模式的自定义说明</div>
					<div
						style={{ fontSize: "13px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
						这些说明适用于所有模式。它们提供了一组基本行为，可以通过下面的特定于模式的说明进行增强。
					</div>
					<VSCodeTextArea
						value={customInstructions ?? ""}
						onChange={(e) => {
							const value =
								(e as CustomEvent)?.detail?.target?.value ||
								((e as any).target as HTMLTextAreaElement).value
							setCustomInstructions(value || undefined)
							vscode.postMessage({
								type: "customInstructions",
								text: value.trim() || undefined,
							})
						}}
						rows={4}
						resize="vertical"
						style={{ width: "100%" }}
						data-testid="global-custom-instructions-textarea"
					/>
					{/* <div
						style={{
							fontSize: "12px",
							color: "var(--vscode-descriptionForeground)",
							marginTop: "5px",
							marginBottom: "40px",
						}}>
						说明也可以从工作区中的{" "}
						<span
							style={{
								color: "var(--vscode-textLink-foreground)",
								cursor: "pointer",
								textDecoration: "underline",
							}}
							onClick={() =>
								vscode.postMessage({
									type: "openFile",
									text: "./.clinerules",
									values: {
										create: true,
										content: "",
									},
								})
							}>
							.clinerules
						</span>{" "}
						文件加载。
					</div> */}
				</div>

				<div style={{ marginTop: "20px" }}>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: "12px",
						}}>
						<h3 style={{ color: "var(--vscode-foreground)", margin: 0 }}>特定模式的提示</h3>
						<div style={{ display: "flex", gap: "8px" }}>
							<VSCodeButton appearance="icon" onClick={openCreateModeDialog} title="创建新模式">
								<span className="codicon codicon-add"></span>
							</VSCodeButton>
							<VSCodeButton
								appearance="icon"
								title="编辑模式配置"
								onClick={() => {
									vscode.postMessage({
										type: "openCustomModesSettings",
									})
								}}>
								<span className="codicon codicon-json"></span>
							</VSCodeButton>
						</div>
					</div>

					<div
						style={{
							fontSize: "13px",
							color: "var(--vscode-descriptionForeground)",
							marginBottom: "12px",
						}}>
						点击 + 创建一个新的自定义模式，或者在聊天中创建一个！
					</div>

					<div
						style={{
							display: "flex",
							gap: "8px",
							alignItems: "center",
							marginBottom: "12px",
							flexWrap: "wrap",
							padding: "4px 0",
						}}>
						{modes.map((modeConfig) => {
							const isActive = mode === modeConfig.slug
							return (
								<button
									key={modeConfig.slug}
									data-testid={`${modeConfig.slug}-tab`}
									data-active={isActive ? "true" : "false"}
									onClick={() => handleModeSwitch(modeConfig)}
									style={{
										padding: "4px 8px",
										border: "none",
										background: isActive ? "var(--vscode-button-background)" : "none",
										color: isActive
											? "var(--vscode-button-foreground)"
											: "var(--vscode-foreground)",
										cursor: "pointer",
										opacity: isActive ? 1 : 0.8,
										borderRadius: "3px",
										fontWeight: "bold",
									}}>
									{modeConfig.name}
								</button>
							)
						})}
					</div>
				</div>

				<div style={{ marginBottom: "20px" }}>
					{/* Only show name and delete for custom modes */}
					{mode && findModeBySlug(mode, customModes) && (
						<div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
							<div style={{ flex: 1 }}>
								<div style={{ fontWeight: "bold", marginBottom: "4px" }}>名称</div>
								<div style={{ display: "flex", gap: "8px" }}>
									<VSCodeTextField
										value={getModeProperty(findModeBySlug(mode, customModes), "name") ?? ""}
										onChange={(e: Event | React.FormEvent<HTMLElement>) => {
											const target =
												(e as CustomEvent)?.detail?.target ||
												((e as any).target as HTMLInputElement)
											const customMode = findModeBySlug(mode, customModes)
											if (customMode) {
												updateCustomMode(mode, {
													...customMode,
													name: target.value,
												})
											}
										}}
										style={{ width: "100%" }}
									/>
									<VSCodeButton
										appearance="icon"
										title="删除模式"
										onClick={() => {
											vscode.postMessage({
												type: "deleteCustomMode",
												slug: mode,
											})
										}}>
										<span className="codicon codicon-trash"></span>
									</VSCodeButton>
								</div>
							</div>
						</div>
					)}
					<div style={{ marginBottom: "16px" }}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: "4px",
							}}>
							<div style={{ fontWeight: "bold" }}>角色定义</div>
							{!findModeBySlug(mode, customModes) && (
								<VSCodeButton
									appearance="icon"
									onClick={() => {
										const currentMode = getCurrentMode()
										if (currentMode?.slug) {
											handleAgentReset(currentMode.slug, "roleDefinition")
										}
									}}
									title="重置为默认值"
									data-testid="role-definition-reset">
									<span className="codicon codicon-discard"></span>
								</VSCodeButton>
							)}
						</div>
						<div
							style={{
								fontSize: "13px",
								color: "var(--vscode-descriptionForeground)",
								marginBottom: "8px",
							}}>
							此描述塑造了AIxCoding如何展现自己和处理任务的方式。
						</div>
						<VSCodeTextArea
							value={(() => {
								const customMode = findModeBySlug(mode, customModes)
								const prompt = customModePrompts?.[mode] as PromptComponent
								return customMode?.roleDefinition ?? prompt?.roleDefinition ?? getRoleDefinition(mode)
							})()}
							onChange={(e) => {
								const value =
									(e as CustomEvent)?.detail?.target?.value ||
									((e as any).target as HTMLTextAreaElement).value
								const customMode = findModeBySlug(mode, customModes)
								if (customMode) {
									// For custom modes, update the JSON file
									updateCustomMode(mode, {
										...customMode,
										roleDefinition: value.trim() || "",
									})
								} else {
									// For built-in modes, update the prompts
									updateAgentPrompt(mode, {
										roleDefinition: value.trim() || undefined,
									})
								}
							}}
							rows={4}
							resize="vertical"
							style={{ width: "100%" }}
							data-testid={`${getCurrentMode()?.slug || "code"}-prompt-textarea`}
						/>
					</div>
					{/* Mode settings */}
					<>
						<div style={{ marginBottom: "12px" }}>
							<div style={{ fontWeight: "bold", marginBottom: "4px" }}>API 配置</div>
							<div style={{ marginBottom: "8px" }}>
								<VSCodeDropdown
									value={currentApiConfigName || ""}
									onChange={(e: any) => {
										const value = e.detail?.target?.value || e.target?.value
										vscode.postMessage({
											type: "loadApiConfiguration",
											text: value,
										})
									}}
									style={{ width: "100%" }}>
									{(listApiConfigMeta || []).map((config) => (
										<VSCodeOption key={config.id} value={config.name}>
											{config.name}
										</VSCodeOption>
									))}
								</VSCodeDropdown>
								<div
									style={{
										fontSize: "12px",
										marginTop: "5px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									选择要用于此模式的 API 配置
								</div>
							</div>
						</div>

						{/* Show tools for all modes */}
						<div style={{ marginBottom: "16px" }}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									marginBottom: "4px",
								}}>
								<div style={{ fontWeight: "bold" }}>可用工具</div>
								{findModeBySlug(mode, customModes) && (
									<VSCodeButton
										appearance="icon"
										onClick={() => setIsToolsEditMode(!isToolsEditMode)}
										title={isToolsEditMode ? "完成编辑" : "编辑工具"}>
										<span
											className={`codicon codicon-${isToolsEditMode ? "check" : "edit"}`}></span>
									</VSCodeButton>
								)}
							</div>
							{!findModeBySlug(mode, customModes) && (
								<div
									style={{
										fontSize: "13px",
										color: "var(--vscode-descriptionForeground)",
										marginBottom: "8px",
									}}>
									内置模式的工具无法修改
								</div>
							)}
							{isToolsEditMode && findModeBySlug(mode, customModes) ? (
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
										gap: "8px",
									}}>
									{availableGroups.map((group) => {
										const currentMode = getCurrentMode()
										const isCustomMode = findModeBySlug(mode, customModes)
										const customMode = isCustomMode
										const isGroupEnabled = isCustomMode
											? customMode?.groups?.some((g) => getGroupName(g) === group)
											: currentMode?.groups?.some((g) => getGroupName(g) === group)

										return (
											<VSCodeCheckbox
												key={group}
												checked={isGroupEnabled}
												onChange={handleGroupChange(group, Boolean(isCustomMode), customMode)}
												disabled={!isCustomMode}>
												{GROUP_DISPLAY_NAMES[group]}
												{group === "edit" && (
													<div
														style={{
															fontSize: "12px",
															color: "var(--vscode-descriptionForeground)",
															marginTop: "2px",
														}}>
														允许的文件:{" "}
														{(() => {
															const currentMode = getCurrentMode()
															const editGroup = currentMode?.groups?.find(
																(g) =>
																	Array.isArray(g) &&
																	g[0] === "edit" &&
																	g[1]?.fileRegex,
															)
															if (!Array.isArray(editGroup)) return "所有文件"
															return (
																editGroup[1].description ||
																`/${editGroup[1].fileRegex}/`
															)
														})()}
													</div>
												)}
											</VSCodeCheckbox>
										)
									})}
								</div>
							) : (
								<div
									style={{
										fontSize: "13px",
										color: "var(--vscode-foreground)",
										marginBottom: "8px",
										lineHeight: "1.4",
									}}>
									{(() => {
										const currentMode = getCurrentMode()
										const enabledGroups = currentMode?.groups || []
										return enabledGroups
											.map((group) => {
												const groupName = getGroupName(group)
												const displayName = GROUP_DISPLAY_NAMES[groupName]
												if (Array.isArray(group) && group[1]?.fileRegex) {
													const description =
														group[1].description || `/${group[1].fileRegex}/`
													return `${displayName} (${description})`
												}
												return displayName
											})
											.join(", ")
									})()}
								</div>
							)}
						</div>
					</>

					{/* Role definition for both built-in and custom modes */}
					<div style={{ marginBottom: "8px" }}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: "4px",
							}}>
							<div style={{ fontWeight: "bold" }}>特定模式的自定义说明</div>
							{!findModeBySlug(mode, customModes) && (
								<VSCodeButton
									appearance="icon"
									onClick={() => {
										const currentMode = getCurrentMode()
										if (currentMode?.slug) {
											handleAgentReset(currentMode.slug, "customInstructions")
										}
									}}
									title="重置为默认值"
									data-testid="custom-instructions-reset">
									<span className="codicon codicon-discard"></span>
								</VSCodeButton>
							)}
						</div>
						<div
							style={{
								fontSize: "13px",
								color: "var(--vscode-descriptionForeground)",
								marginBottom: "8px",
							}}>
							添加特定于 {getCurrentMode()?.name || "代码"} 模式的行为准则。
						</div>
						<VSCodeTextArea
							value={(() => {
								const customMode = findModeBySlug(mode, customModes)
								const prompt = customModePrompts?.[mode] as PromptComponent
								return (
									customMode?.customInstructions ??
									prompt?.customInstructions ??
									getCustomInstructions(mode, customModes)
								)
							})()}
							onChange={(e) => {
								const value =
									(e as CustomEvent)?.detail?.target?.value ||
									((e as any).target as HTMLTextAreaElement).value
								const customMode = findModeBySlug(mode, customModes)
								if (customMode) {
									// For custom modes, update the JSON file
									updateCustomMode(mode, {
										...customMode,
										customInstructions: value.trim() || undefined,
									})
								} else {
									// For built-in modes, update the prompts
									const existingPrompt = customModePrompts?.[mode] as PromptComponent
									updateAgentPrompt(mode, {
										...existingPrompt,
										customInstructions: value.trim(),
									})
								}
							}}
							rows={4}
							resize="vertical"
							style={{ width: "100%" }}
							data-testid={`${getCurrentMode()?.slug || "code"}-custom-instructions-textarea`}
						/>
						{/* <div
							style={{
								fontSize: "12px",
								color: "var(--vscode-descriptionForeground)",
								marginTop: "5px",
							}}>
							特定于 {getCurrentMode()?.name || "代码"} 模式的自定义说明也可以从工作区中的{" "}
							<span
								style={{
									color: "var(--vscode-textLink-foreground)",
									cursor: "pointer",
									textDecoration: "underline",
								}}
								onClick={() => {
									const currentMode = getCurrentMode()
									if (!currentMode) return

									// Open or create an empty file
									vscode.postMessage({
										type: "openFile",
										text: `./.clinerules-${currentMode.slug}`,
										values: {
											create: true,
											content: "",
										},
									})
								}}>
								.clinerules-{getCurrentMode()?.slug || "code"}
							</span>{" "}
							文件加载。
						</div> */}
					</div>
				</div>
				<div
					style={{
						paddingBottom: "40px",
						marginBottom: "20px",
						borderBottom: "1px solid var(--vscode-input-border)",
					}}>
					<div style={{ display: "flex", gap: "8px" }}>
						<VSCodeButton
							appearance="primary"
							onClick={() => {
								const currentMode = getCurrentMode()
								if (currentMode) {
									vscode.postMessage({
										type: "getSystemPrompt",
										mode: currentMode.slug,
									})
								}
							}}
							data-testid="preview-prompt-button">
							预览系统提示
						</VSCodeButton>
						<VSCodeButton
							appearance="icon"
							title="复制系统提示到剪贴板"
							onClick={() => {
								vscode.postMessage({
									type: "copySystemPrompt",
									text: selectedPromptContent,
								})
							}}
							data-testid="copy-prompt-button">
							<span className="codicon codicon-copy"></span>
						</VSCodeButton>
					</div>
				</div>

				<div
					style={{
						marginTop: "20px",
						paddingBottom: "60px",
						borderBottom: "1px solid var(--vscode-input-border)",
					}}>
					<h3 style={{ color: "var(--vscode-foreground)", marginBottom: "12px" }}>支持提示</h3>
					<div
						style={{
							display: "flex",
							gap: "8px",
							alignItems: "center",
							marginBottom: "12px",
							flexWrap: "wrap",
							padding: "4px 0",
						}}>
						{Object.keys(supportPrompt.default).map((type) => (
							<button
								key={type}
								data-testid={`${type}-tab`}
								data-active={activeSupportTab === type ? "true" : "false"}
								onClick={() => setActiveSupportTab(type as SupportPromptType)}
								style={{
									padding: "4px 8px",
									border: "none",
									background: activeSupportTab === type ? "var(--vscode-button-background)" : "none",
									color:
										activeSupportTab === type
											? "var(--vscode-button-foreground)"
											: "var(--vscode-foreground)",
									cursor: "pointer",
									opacity: activeSupportTab === type ? 1 : 0.8,
									borderRadius: "3px",
									fontWeight: "bold",
								}}>
								{supportPromptLabels[type as SupportPromptType]}
							</button>
						))}
					</div>

					{/* Support prompt description */}
					<div
						style={{
							fontSize: "13px",
							color: "var(--vscode-descriptionForeground)",
							margin: "8px 0 16px",
						}}>
						{supportPromptDescriptions[activeSupportTab]}
					</div>

					{/* Show active tab content */}
					<div key={activeSupportTab}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: "4px",
							}}>
							<div style={{ fontWeight: "bold" }}>提示</div>
							<VSCodeButton
								appearance="icon"
								onClick={() => handleSupportReset(activeSupportTab)}
								title={`将 ${activeSupportTab} 提示重置为默认值`}>
								<span className="codicon codicon-discard"></span>
							</VSCodeButton>
						</div>

						<VSCodeTextArea
							value={getSupportPromptValue(activeSupportTab)}
							onChange={(e) => {
								const value =
									(e as CustomEvent)?.detail?.target?.value ||
									((e as any).target as HTMLTextAreaElement).value
								const trimmedValue = value.trim()
								updateSupportPrompt(activeSupportTab, trimmedValue || undefined)
							}}
							rows={6}
							resize="vertical"
							style={{ width: "100%" }}
						/>

						{activeSupportTab === "ENHANCE" && (
							<>
								<div>
									<div
										style={{
											color: "var(--vscode-foreground)",
											fontSize: "13px",
											marginBottom: "20px",
											marginTop: "5px",
										}}></div>
									<div style={{ marginBottom: "12px" }}>
										<div style={{ marginBottom: "8px" }}>
											<div style={{ fontWeight: "bold", marginBottom: "4px" }}>API 配置</div>
											<div
												style={{
													fontSize: "13px",
													color: "var(--vscode-descriptionForeground)",
												}}>
												您可以选择始终用于增强提示的 API 配置，或者使用当前选择的任何配置
											</div>
										</div>
										<VSCodeDropdown
											value={enhancementApiConfigId || ""}
											data-testid="api-config-dropdown"
											onChange={(e: any) => {
												const value = e.detail?.target?.value || e.target?.value
												setEnhancementApiConfigId(value)
												vscode.postMessage({
													type: "enhancementApiConfigId",
													text: value,
												})
											}}
											style={{ width: "300px" }}>
											<VSCodeOption value="">使用当前选择的 API 配置</VSCodeOption>
											{(listApiConfigMeta || []).map((config) => (
												<VSCodeOption key={config.id} value={config.id}>
													{config.name}
												</VSCodeOption>
											))}
										</VSCodeDropdown>
									</div>
								</div>

								<div style={{ marginTop: "12px" }}>
									<VSCodeTextArea
										value={testPrompt}
										onChange={(e) => setTestPrompt((e.target as HTMLTextAreaElement).value)}
										placeholder="输入提示以测试增强功能"
										rows={3}
										resize="vertical"
										style={{ width: "100%" }}
										data-testid="test-prompt-textarea"
									/>
									<div
										style={{
											marginTop: "8px",
											display: "flex",
											justifyContent: "flex-start",
											alignItems: "center",
											gap: 8,
										}}>
										<VSCodeButton
											onClick={handleTestEnhancement}
											disabled={isEnhancing}
											appearance="primary">
											预览提示增强
										</VSCodeButton>
									</div>
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{isCreateModeDialogOpen && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						display: "flex",
						justifyContent: "flex-end",
						backgroundColor: "rgba(0, 0, 0, 0.5)",
						zIndex: 1000,
					}}>
					<div
						style={{
							width: "calc(100vw - 100px)",
							height: "100%",
							backgroundColor: "var(--vscode-editor-background)",
							boxShadow: "-2px 0 5px rgba(0, 0, 0, 0.2)",
							display: "flex",
							flexDirection: "column",
							position: "relative",
						}}>
						<div
							style={{
								flex: 1,
								padding: "20px",
								overflowY: "auto",
								minHeight: 0,
							}}>
							<VSCodeButton
								appearance="icon"
								onClick={() => setIsCreateModeDialogOpen(false)}
								style={{
									position: "absolute",
									top: "20px",
									right: "20px",
								}}>
								<span className="codicon codicon-close"></span>
							</VSCodeButton>
							<h2 style={{ margin: "0 0 16px" }}>创建新模式</h2>
							<div style={{ marginBottom: "16px" }}>
								<div style={{ fontWeight: "bold", marginBottom: "4px" }}>名称</div>
								<VSCodeTextField
									value={newModeName}
									onChange={(e: Event | React.FormEvent<HTMLElement>) => {
										const target =
											(e as CustomEvent)?.detail?.target ||
											((e as any).target as HTMLInputElement)
										handleNameChange(target.value)
									}}
									style={{ width: "100%" }}
								/>
							</div>
							<div style={{ marginBottom: "16px" }}>
								<div style={{ fontWeight: "bold", marginBottom: "4px" }}>标识</div>
								<VSCodeTextField
									value={newModeSlug}
									onChange={(e: Event | React.FormEvent<HTMLElement>) => {
										const target =
											(e as CustomEvent)?.detail?.target ||
											((e as any).target as HTMLInputElement)
										setNewModeSlug(target.value)
									}}
									style={{ width: "100%" }}
								/>
								<div
									style={{
										fontSize: "12px",
										color: "var(--vscode-descriptionForeground)",
										marginTop: "4px",
									}}>
									标识用于 URL 和文件名。它应为英文小写，并且仅包含字母、数字和连字符。
								</div>
							</div>
							<div style={{ marginBottom: "16px" }}>
								<div style={{ fontWeight: "bold", marginBottom: "4px" }}>角色定义</div>
								<div
									style={{
										fontSize: "13px",
										color: "var(--vscode-descriptionForeground)",
										marginBottom: "8px",
									}}>
									定义插件在此模式下的专业知识和个性。
								</div>
								<VSCodeTextArea
									value={newModeRoleDefinition}
									onChange={(e) => {
										const value =
											(e as CustomEvent)?.detail?.target?.value ||
											((e as any).target as HTMLTextAreaElement).value
										setNewModeRoleDefinition(value)
									}}
									rows={4}
									resize="vertical"
									style={{ width: "100%" }}
								/>
							</div>
							<div style={{ marginBottom: "16px" }}>
								<div style={{ fontWeight: "bold", marginBottom: "4px" }}>可用工具</div>
								<div
									style={{
										fontSize: "13px",
										color: "var(--vscode-descriptionForeground)",
										marginBottom: "8px",
									}}>
									选择此模式可以使用的工具。
								</div>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
										gap: "8px",
									}}>
									{availableGroups.map((group) => (
										<VSCodeCheckbox
											key={group}
											checked={newModeGroups.some((g) => getGroupName(g) === group)}
											onChange={(e: Event | React.FormEvent<HTMLElement>) => {
												const target =
													(e as CustomEvent)?.detail?.target || (e.target as HTMLInputElement)
												const checked = target.checked
												if (checked) {
													setNewModeGroups([...newModeGroups, group])
												} else {
													setNewModeGroups(
														newModeGroups.filter((g) => getGroupName(g) !== group),
													)
												}
											}}>
											{GROUP_DISPLAY_NAMES[group]}
										</VSCodeCheckbox>
									))}
								</div>
							</div>
							<div style={{ marginBottom: "16px" }}>
								<div style={{ fontWeight: "bold", marginBottom: "4px" }}>自定义说明</div>
								<div
									style={{
										fontSize: "13px",
										color: "var(--vscode-descriptionForeground)",
										marginBottom: "8px",
									}}>
									增加这个自定义模式的说明
								</div>
								<VSCodeTextArea
									value={newModeCustomInstructions}
									onChange={(e) => {
										const value =
											(e as CustomEvent)?.detail?.target?.value ||
											((e as any).target as HTMLTextAreaElement).value
										setNewModeCustomInstructions(value)
									}}
									rows={4}
									resize="vertical"
									style={{ width: "100%" }}
								/>
							</div>
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								padding: "12px 20px",
								gap: "8px",
								borderTop: "1px solid var(--vscode-editor-lineHighlightBorder)",
								backgroundColor: "var(--vscode-editor-background)",
							}}>
							<VSCodeButton onClick={() => setIsCreateModeDialogOpen(false)}>取消</VSCodeButton>
							<VSCodeButton
								appearance="primary"
								onClick={handleCreateMode}
								disabled={!newModeName.trim() || !newModeSlug.trim()}>
								创建模式
							</VSCodeButton>
						</div>
					</div>
				</div>
			)}
			{isDialogOpen && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						display: "flex",
						justifyContent: "flex-end",
						backgroundColor: "rgba(0, 0, 0, 0.5)",
						zIndex: 1000,
					}}>
					<div
						style={{
							width: "calc(100vw - 100px)",
							height: "100%",
							backgroundColor: "var(--vscode-editor-background)",
							boxShadow: "-2px 0 5px rgba(0, 0, 0, 0.2)",
							display: "flex",
							flexDirection: "column",
							position: "relative",
						}}>
						<div
							style={{
								flex: 1,
								padding: "20px",
								overflowY: "auto",
								minHeight: 0,
							}}>
							<VSCodeButton
								appearance="icon"
								onClick={() => setIsDialogOpen(false)}
								style={{
									position: "absolute",
									top: "20px",
									right: "20px",
								}}>
								<span className="codicon codicon-close"></span>
							</VSCodeButton>
							<h2 style={{ margin: "0 0 16px" }}>{selectedPromptTitle}</h2>
							<pre
								style={{
									padding: "8px",
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
									fontFamily: "var(--vscode-editor-font-family)",
									fontSize: "var(--vscode-editor-font-size)",
									color: "var(--vscode-editor-foreground)",
									backgroundColor: "var(--vscode-editor-background)",
									border: "1px solid var(--vscode-editor-lineHighlightBorder)",
									borderRadius: "4px",
									overflowY: "auto",
								}}>
								{selectedPromptContent}
							</pre>
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								padding: "12px 20px",
								borderTop: "1px solid var(--vscode-editor-lineHighlightBorder)",
								backgroundColor: "var(--vscode-editor-background)",
							}}>
							<VSCodeButton onClick={() => setIsDialogOpen(false)}>Close</VSCodeButton>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export default PromptsView
