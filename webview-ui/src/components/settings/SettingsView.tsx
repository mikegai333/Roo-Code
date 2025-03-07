import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { validateApiConfiguration, validateModelId } from "../../utils/validate"
import { vscode } from "../../utils/vscode"
import ApiOptions from "./ApiOptions"
import ExperimentalFeature from "./ExperimentalFeature"
import { EXPERIMENT_IDS, experimentConfigsMap } from "../../../../src/shared/experiments"
import ApiConfigManager from "./ApiConfigManager"
import { Dropdown } from "vscrui"
import type { DropdownOption } from "vscrui"

type SettingsViewProps = {
	onDone: () => void
}

const SettingsView = ({ onDone }: SettingsViewProps) => {
	const {
		apiConfiguration,
		// version,
		alwaysAllowReadOnly,
		setAlwaysAllowReadOnly,
		reportApi,
		setReportApi,
		baseApi,
		setBaseApi,
		alwaysAllowWrite,
		setAlwaysAllowWrite,
		alwaysAllowExecute,
		setAlwaysAllowExecute,
		alwaysAllowBrowser,
		setAlwaysAllowBrowser,
		alwaysAllowMcp,
		setAlwaysAllowMcp,
		soundEnabled,
		setSoundEnabled,
		soundVolume,
		setSoundVolume,
		diffEnabled,
		setDiffEnabled,
		checkpointsEnabled,
		setCheckpointsEnabled,
		browserViewportSize,
		setBrowserViewportSize,
		openRouterModels,
		glamaModels,
		setAllowedCommands,
		allowedCommands,
		fuzzyMatchThreshold,
		setFuzzyMatchThreshold,
		writeDelayMs,
		setWriteDelayMs,
		screenshotQuality,
		setScreenshotQuality,
		terminalOutputLineLimit,
		setTerminalOutputLineLimit,
		mcpEnabled,
		alwaysApproveResubmit,
		setAlwaysApproveResubmit,
		requestDelaySeconds,
		setRequestDelaySeconds,
		rateLimitSeconds,
		setRateLimitSeconds,
		currentApiConfigName,
		listApiConfigMeta,
		experiments,
		setExperimentEnabled,
		alwaysAllowModeSwitch,
		setAlwaysAllowModeSwitch,

		// enableCompletion,
		// setEnableCompletion,
	} = useExtensionState()
	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const [modelIdErrorMessage, setModelIdErrorMessage] = useState<string | undefined>(undefined)
	const [commandInput, setCommandInput] = useState("")

	const handleSubmit = async () => {
		// Focus the active element's parent to trigger blur
		document.activeElement?.parentElement?.focus()

		// Small delay to let blur events complete
		await new Promise((resolve) => setTimeout(resolve, 50))

		const apiValidationResult = validateApiConfiguration(apiConfiguration)
		const modelIdValidationResult = validateModelId(apiConfiguration, glamaModels, openRouterModels)

		setApiErrorMessage(apiValidationResult)
		setModelIdErrorMessage(modelIdValidationResult)
		if (!apiValidationResult && !modelIdValidationResult) {
			vscode.postMessage({
				type: "apiConfiguration",
				apiConfiguration,
			})
			vscode.postMessage({ type: "alwaysAllowReadOnly", bool: alwaysAllowReadOnly })
			vscode.postMessage({ type: "alwaysAllowWrite", bool: alwaysAllowWrite })
			vscode.postMessage({ type: "alwaysAllowExecute", bool: alwaysAllowExecute })
			vscode.postMessage({ type: "alwaysAllowBrowser", bool: alwaysAllowBrowser })
			vscode.postMessage({ type: "alwaysAllowMcp", bool: alwaysAllowMcp })
			vscode.postMessage({ type: "allowedCommands", commands: allowedCommands ?? [] })
			vscode.postMessage({ type: "soundEnabled", bool: soundEnabled })
			vscode.postMessage({ type: "soundVolume", value: soundVolume })
			vscode.postMessage({ type: "diffEnabled", bool: diffEnabled })
			vscode.postMessage({ type: "checkpointsEnabled", bool: checkpointsEnabled })
			vscode.postMessage({ type: "browserViewportSize", text: browserViewportSize })
			vscode.postMessage({ type: "fuzzyMatchThreshold", value: fuzzyMatchThreshold ?? 1.0 })
			vscode.postMessage({ type: "writeDelayMs", value: writeDelayMs })
			vscode.postMessage({ type: "screenshotQuality", value: screenshotQuality ?? 75 })
			vscode.postMessage({ type: "terminalOutputLineLimit", value: terminalOutputLineLimit ?? 500 })
			vscode.postMessage({ type: "mcpEnabled", bool: mcpEnabled })
			vscode.postMessage({ type: "alwaysApproveResubmit", bool: alwaysApproveResubmit })
			vscode.postMessage({ type: "requestDelaySeconds", value: requestDelaySeconds })
			vscode.postMessage({ type: "rateLimitSeconds", value: rateLimitSeconds })
			vscode.postMessage({ type: "currentApiConfigName", text: currentApiConfigName })
			vscode.postMessage({
				type: "upsertApiConfiguration",
				text: currentApiConfigName,
				apiConfiguration,
			})

			vscode.postMessage({
				type: "updateExperimental",
				values: experiments,
			})

			vscode.postMessage({ type: "alwaysAllowModeSwitch", bool: alwaysAllowModeSwitch })
			vscode.postMessage({ type: "soundEnabled", bool: soundEnabled })
			vscode.postMessage({ type: "reportApi", text: reportApi } as any)
			vscode.postMessage({ type: "baseApi", text: baseApi } as any)
			onDone()
		}
	}

	useEffect(() => {
		setApiErrorMessage(undefined)
		setModelIdErrorMessage(undefined)
	}, [apiConfiguration])

	// Initial validation on mount
	useEffect(() => {
		const apiValidationResult = validateApiConfiguration(apiConfiguration)
		const modelIdValidationResult = validateModelId(apiConfiguration, glamaModels, openRouterModels)
		setApiErrorMessage(apiValidationResult)
		setModelIdErrorMessage(modelIdValidationResult)
	}, [apiConfiguration, glamaModels, openRouterModels])

	const handleResetState = () => {
		vscode.postMessage({ type: "resetState" })
	}

	const handleAddCommand = () => {
		const currentCommands = allowedCommands ?? []
		if (commandInput && !currentCommands.includes(commandInput)) {
			const newCommands = [...currentCommands, commandInput]
			setAllowedCommands(newCommands)
			setCommandInput("")
			vscode.postMessage({
				type: "allowedCommands",
				commands: newCommands,
			})
		}
	}

	const sliderLabelStyle = {
		minWidth: "45px",
		textAlign: "right" as const,
		lineHeight: "20px",
		paddingBottom: "2px",
	}

	const sliderStyle = {
		flexGrow: 1,
		maxWidth: "80%",
		accentColor: "var(--vscode-button-background)",
		height: "2px",
	}

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				padding: "10px 0px 0px 20px",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "17px",
					paddingRight: 17,
				}}>
				<h3 style={{ color: "var(--vscode-foreground)", margin: 0 }}>设置</h3>
				<VSCodeButton onClick={handleSubmit}>完成</VSCodeButton>
			</div>
			<div
				style={{ flexGrow: 1, overflowY: "scroll", paddingRight: 8, display: "flex", flexDirection: "column" }}>
				<div style={{ marginBottom: 40 }}>
					<h3 style={{ color: "var(--vscode-foreground)", margin: "0 0 15px 0" }}>提供程序设置</h3>
					<div style={{ marginBottom: 15 }}>
						<ApiConfigManager
							currentApiConfigName={currentApiConfigName}
							listApiConfigMeta={listApiConfigMeta}
							onSelectConfig={(configName: string) => {
								vscode.postMessage({
									type: "loadApiConfiguration",
									text: configName,
								})
							}}
							onDeleteConfig={(configName: string) => {
								vscode.postMessage({
									type: "deleteApiConfiguration",
									text: configName,
								})
							}}
							onRenameConfig={(oldName: string, newName: string) => {
								vscode.postMessage({
									type: "renameApiConfiguration",
									values: { oldName, newName },
									apiConfiguration,
								})
							}}
							onUpsertConfig={(configName: string) => {
								vscode.postMessage({
									type: "upsertApiConfiguration",
									text: configName,
									apiConfiguration,
								})
							}}
						/>
						<ApiOptions apiErrorMessage={apiErrorMessage} modelIdErrorMessage={modelIdErrorMessage} />
					</div>
				</div>
				<div style={{ marginBottom: 40 }}>
					<h3 style={{ color: "var(--vscode-foreground)", margin: "0 0 15px 0" }}>基础 API 设置</h3>
					<div style={{ marginBottom: 15 }}>
						<VSCodeTextField
							value={baseApi}
							style={{ width: "100%" }}
							type="url"
							placeholder={"请输入基础 API..."}
							onChange={(e: any) => setBaseApi(e.target.value)}>
							<span style={{ fontWeight: 500 }}>基础 API</span>
						</VSCodeTextField>
					</div>
				</div>
				<div style={{ marginBottom: 40 }}>
					<h3 style={{ color: "var(--vscode-foreground)", margin: "0 0 15px 0" }}>代码扫描设置</h3>
					<div style={{ marginBottom: 15 }}>
						<VSCodeTextField
							value={reportApi}
							style={{ width: "100%" }}
							type="url"
							placeholder={"请输入获取扫描报告的 URL..."}
							onChange={(e: any) => setReportApi(e.target.value)}>
							<span style={{ fontWeight: 500 }}>获取扫描报告的 URL</span>
						</VSCodeTextField>
					</div>
				</div>

				<div style={{ marginBottom: 40 }}>
					<h3 style={{ color: "var(--vscode-foreground)", margin: "0 0 15px 0" }}>自动批准设置</h3>
					<p style={{ fontSize: "12px", marginBottom: 15, color: "var(--vscode-descriptionForeground)" }}>
						以下设置允许插件自动执行操作，而无需请求批准。仅当您完全信任 AI
						并了解相关的安全风险时，才启用这些设置。
					</p>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowReadOnly}
							onChange={(e: any) => setAlwaysAllowReadOnly(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>始终批准只读操作</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							启用后，插件将自动查看目录内容和读取文件，而无需您单击“批准”按钮。
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowWrite}
							onChange={(e: any) => setAlwaysAllowWrite(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>始终批准写入操作</span>
						</VSCodeCheckbox>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							自动创建和编辑文件，而无需批准
						</p>
						{alwaysAllowWrite && (
							<div
								style={{
									marginTop: 10,
									paddingLeft: 10,
									borderLeft: "2px solid var(--vscode-button-background)",
								}}>
								<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
									<input
										type="range"
										min="0"
										max="5000"
										step="100"
										value={writeDelayMs}
										onChange={(e) => setWriteDelayMs(parseInt(e.target.value))}
										style={{
											flex: 1,
											accentColor: "var(--vscode-button-background)",
											height: "2px",
										}}
									/>
									<span style={{ minWidth: "45px", textAlign: "left" }}>{writeDelayMs}ms</span>
								</div>
								<p
									style={{
										fontSize: "12px",
										marginTop: "5px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									写入后延迟，以允许诊断程序检测潜在问题
								</p>
							</div>
						)}
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowBrowser}
							onChange={(e: any) => setAlwaysAllowBrowser(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>始终批准浏览器操作</span>
						</VSCodeCheckbox>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							自动执行浏览器操作，而无需批准
							<br />
							注意：仅当模型支持计算机使用时才适用
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysApproveResubmit}
							onChange={(e: any) => setAlwaysApproveResubmit(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>始终重试失败的 API 请求</span>
						</VSCodeCheckbox>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							当服务器返回错误响应时，自动重试失败的 API 请求
						</p>
						{alwaysApproveResubmit && (
							<div
								style={{
									marginTop: 10,
									paddingLeft: 10,
									borderLeft: "2px solid var(--vscode-button-background)",
								}}>
								<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
									<input
										type="range"
										min="5"
										max="100"
										step="1"
										value={requestDelaySeconds}
										onChange={(e) => setRequestDelaySeconds(parseInt(e.target.value))}
										style={{
											flex: 1,
											accentColor: "var(--vscode-button-background)",
											height: "2px",
										}}
									/>
									<span style={{ minWidth: "45px", textAlign: "left" }}>{requestDelaySeconds}s</span>
								</div>
								<p
									style={{
										fontSize: "12px",
										marginTop: "5px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									重试请求前的延迟
								</p>
							</div>
						)}
					</div>

					<div style={{ marginBottom: 15, display: "none" }}>
						<VSCodeCheckbox
							checked={alwaysAllowMcp}
							onChange={(e: any) => setAlwaysAllowMcp(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>始终批准 MCP 工具</span>
						</VSCodeCheckbox>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							在 MCP 服务器视图中启用对各个 MCP 工具的自动批准（需要此设置和工具的单独“始终允许”复选框）
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowModeSwitch}
							onChange={(e: any) => setAlwaysAllowModeSwitch(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>始终批准模式切换和任务创建</span>
						</VSCodeCheckbox>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							自动在不同的 AI 模式之间切换并创建新任务，而无需批准
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowExecute}
							onChange={(e: any) => setAlwaysAllowExecute(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>始终批准允许的执行操作</span>
						</VSCodeCheckbox>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							自动执行允许的终端命令，而无需批准
						</p>

						{alwaysAllowExecute && (
							<div
								style={{
									marginTop: 10,
									paddingLeft: 10,
									borderLeft: "2px solid var(--vscode-button-background)",
								}}>
								<span style={{ fontWeight: "500" }}>允许自动执行的命令</span>
								<p
									style={{
										fontSize: "12px",
										marginTop: "5px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									启用“始终批准执行操作”后可以自动执行的命令前缀。
								</p>

								<div style={{ display: "flex", gap: "5px", marginTop: "10px" }}>
									<VSCodeTextField
										value={commandInput}
										onInput={(e: any) => setCommandInput(e.target.value)}
										onKeyDown={(e: any) => {
											if (e.key === "Enter") {
												e.preventDefault()
												handleAddCommand()
											}
										}}
										placeholder="输入命令前缀 (例如, 'git ')"
										style={{ flexGrow: 1 }}
									/>
									<VSCodeButton onClick={handleAddCommand}>添加</VSCodeButton>
								</div>

								<div
									style={{
										marginTop: "10px",
										display: "flex",
										flexWrap: "wrap",
										gap: "5px",
									}}>
									{(allowedCommands ?? []).map((cmd, index) => (
										<div
											key={index}
											style={{
												display: "flex",
												alignItems: "center",
												gap: "5px",
												backgroundColor: "var(--vscode-button-secondaryBackground)",
												padding: "2px 6px",
												borderRadius: "4px",
												border: "1px solid var(--vscode-button-secondaryBorder)",
												height: "24px",
											}}>
											<span>{cmd}</span>
											<VSCodeButton
												appearance="icon"
												style={{
													padding: 0,
													margin: 0,
													height: "20px",
													width: "20px",
													minWidth: "20px",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													color: "var(--vscode-button-foreground)",
												}}
												onClick={() => {
													const newCommands = (allowedCommands ?? []).filter(
														(_, i) => i !== index,
													)
													setAllowedCommands(newCommands)
													vscode.postMessage({
														type: "allowedCommands",
														commands: newCommands,
													})
												}}>
												<span className="codicon codicon-close" />
											</VSCodeButton>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				</div>

				<div style={{ marginBottom: 40 }}>
					<h3 style={{ color: "var(--vscode-foreground)", margin: "0 0 15px 0" }}>浏览器设置</h3>
					<div style={{ marginBottom: 15 }}>
						<label style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>视口大小</label>
						<div className="dropdown-container">
							<Dropdown
								value={browserViewportSize}
								onChange={(value: unknown) => {
									setBrowserViewportSize((value as DropdownOption).value)
								}}
								style={{ width: "100%" }}
								options={[
									{ value: "1280x800", label: "大型桌面 (1280x800)" },
									{ value: "900x600", label: "小型桌面 (900x600)" },
									{ value: "768x1024", label: "平板电脑 (768x1024)" },
									{ value: "360x640", label: "移动设备 (360x640)" },
								]}
							/>
						</div>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							选择浏览器交互的视口大小。这会影响网站的显示方式和交互方式。
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
							<span style={{ fontWeight: "500" }}>屏幕截图质量</span>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<input
									type="range"
									min="1"
									max="100"
									step="1"
									value={screenshotQuality ?? 75}
									onChange={(e) => setScreenshotQuality(parseInt(e.target.value))}
									style={{
										...sliderStyle,
									}}
								/>
								<span style={{ ...sliderLabelStyle }}>{screenshotQuality ?? 75}%</span>
							</div>
						</div>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							调整浏览器屏幕截图的 WebP 质量。较高的值提供更清晰的屏幕截图，但会增加令牌使用量。
						</p>
					</div>
				</div>

				<div style={{ marginBottom: 40, display: "none" }}>
					<h3 style={{ color: "var(--vscode-foreground)", margin: "0 0 15px 0" }}>通知设置</h3>
					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox checked={soundEnabled} onChange={(e: any) => setSoundEnabled(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>启用音效</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							启用后，插件将为通知和事件播放音效。
						</p>
					</div>
					{soundEnabled && (
						<div
							style={{
								marginLeft: 0,
								paddingLeft: 10,
								borderLeft: "2px solid var(--vscode-button-background)",
							}}>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<span style={{ fontWeight: "500", minWidth: "100px" }}>音量</span>
								<input
									type="range"
									min="0"
									max="1"
									step="0.01"
									value={soundVolume ?? 0.5}
									onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
									style={{
										flexGrow: 1,
										accentColor: "var(--vscode-button-background)",
										height: "2px",
									}}
									aria-label="Volume"
								/>
								<span style={{ minWidth: "35px", textAlign: "left" }}>
									{((soundVolume ?? 0.5) * 100).toFixed(0)}%
								</span>
							</div>
						</div>
					)}
				</div>

				<div style={{ marginBottom: 40 }}>
					<h3 style={{ color: "var(--vscode-foreground)", margin: "0 0 15px 0" }}>高级设置</h3>
					<div style={{ marginBottom: 15 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
							<span style={{ fontWeight: "500" }}>速率限制</span>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<input
									type="range"
									min="0"
									max="60"
									step="1"
									value={rateLimitSeconds}
									onChange={(e) => setRateLimitSeconds(parseInt(e.target.value))}
									style={{ ...sliderStyle }}
								/>
								<span style={{ ...sliderLabelStyle }}>{rateLimitSeconds}s</span>
							</div>
						</div>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							API 请求之间的最短时间。
						</p>
					</div>
					<div style={{ marginBottom: 15 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
							<span style={{ fontWeight: "500" }}>终端输出限制</span>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<input
									type="range"
									min="100"
									max="5000"
									step="100"
									value={terminalOutputLineLimit ?? 500}
									onChange={(e) => setTerminalOutputLineLimit(parseInt(e.target.value))}
									style={{ ...sliderStyle }}
								/>
								<span style={{ ...sliderLabelStyle }}>{terminalOutputLineLimit ?? 500}</span>
							</div>
						</div>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							执行命令时要包含在终端输出中的最大行数。超出时，将从中间删除行，从而节省令牌。
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={diffEnabled}
							onChange={(e: any) => {
								setDiffEnabled(e.target.checked)
								if (!e.target.checked) {
									// Reset experimental strategy when diffs are disabled
									setExperimentEnabled(EXPERIMENT_IDS.DIFF_STRATEGY, false)
								}
							}}>
							<span style={{ fontWeight: "500" }}>启用通过差异进行编辑</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							启用后，插件将能够更快地编辑文件，并且会自动拒绝截断的完整文件写入。与最新的 Claude 3.5
							Sonnet 模型配合使用效果最佳。
						</p>

						{diffEnabled && (
							<div style={{ marginTop: 10 }}>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "5px",
										marginTop: "10px",
										marginBottom: "10px",
										paddingLeft: "10px",
										borderLeft: "2px solid var(--vscode-button-background)",
									}}>
									<span style={{ fontWeight: "500" }}>匹配精度</span>
									<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
										<input
											type="range"
											min="0.8"
											max="1"
											step="0.005"
											value={fuzzyMatchThreshold ?? 1.0}
											onChange={(e) => {
												setFuzzyMatchThreshold(parseFloat(e.target.value))
											}}
											style={{
												...sliderStyle,
											}}
										/>
										<span style={{ ...sliderLabelStyle }}>
											{Math.round((fuzzyMatchThreshold || 1) * 100)}%
										</span>
									</div>
									<p
										style={{
											fontSize: "12px",
											marginTop: "5px",
											color: "var(--vscode-descriptionForeground)",
										}}>
										此滑块控制应用差异时代码段必须匹配的精确程度。较低的值允许更灵活的匹配，但会增加不正确替换的风险。使用低于
										100% 的值时要格外小心。
									</p>
									<ExperimentalFeature
										key={EXPERIMENT_IDS.DIFF_STRATEGY}
										{...experimentConfigsMap.DIFF_STRATEGY}
										enabled={experiments[EXPERIMENT_IDS.DIFF_STRATEGY] ?? false}
										onChange={(enabled) =>
											setExperimentEnabled(EXPERIMENT_IDS.DIFF_STRATEGY, enabled)
										}
									/>
								</div>
							</div>
						)}

						<div style={{ marginBottom: 15 }}>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<span style={{ color: "var(--vscode-errorForeground)" }}>⚠️</span>
								<VSCodeCheckbox
									checked={checkpointsEnabled}
									onChange={(e: any) => {
										setCheckpointsEnabled(e.target.checked)
									}}>
									<span style={{ fontWeight: "500" }}>启用实验性检查点</span>
								</VSCodeCheckbox>
							</div>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								启用后，每当工作区中的文件被修改、添加或删除时，插件都会保存一个检查点，让您可以轻松地恢复到以前的状态。
							</p>
						</div>

						{Object.entries(experimentConfigsMap)
							.filter((config) => config[0] !== "DIFF_STRATEGY")
							.map((config) => (
								<ExperimentalFeature
									key={config[0]}
									{...config[1]}
									enabled={
										experiments[EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]] ?? false
									}
									onChange={(enabled) =>
										setExperimentEnabled(
											EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS],
											enabled,
										)
									}
								/>
							))}
					</div>
				</div>

				<div
					style={{
						textAlign: "center",
						color: "var(--vscode-descriptionForeground)",
						fontSize: "12px",
						lineHeight: "1.2",
						marginTop: "auto",
						padding: "10px 8px 15px 0px",
					}}>
					<p style={{ wordWrap: "break-word", margin: 0, padding: 0 }}>
						如果您有任何问题或反馈，可访问产品官网或扫码加入行信群交流：
						<VSCodeLink href="http://22.189.54.139" style={{ display: "inline" }}>
							AIxCoding
						</VSCodeLink>
					</p>
					{/* <p style={{ fontStyle: "italic", margin: "10px 0 0 0", padding: 0, marginBottom: 100 }}>
						v{version}
					</p> */}

					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						这将重置扩展中的所有全局状态和密钥存储。
					</p>

					<VSCodeButton
						onClick={handleResetState}
						appearance="secondary"
						style={{ marginTop: "5px", width: "auto" }}>
						重置状态
					</VSCodeButton>
				</div>
			</div>
		</div>
	)
}

export default memo(SettingsView)
