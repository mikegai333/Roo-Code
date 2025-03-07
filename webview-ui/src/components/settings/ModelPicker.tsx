// import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import debounce from "debounce"
import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { useMount } from "react-use"
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import {
	Button,
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui"

import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import { normalizeApiConfiguration } from "./ApiOptions"
import { ModelInfoView } from "./ModelInfoView"

type ModelProvider = "glama" | "openRouter" | "unbound" | "requesty" | "openAi"

type ModelKeys<T extends ModelProvider> = `${T}Models`
type ConfigKeys<T extends ModelProvider> = `${T}ModelId`
type InfoKeys<T extends ModelProvider> = `${T}ModelInfo`
type RefreshMessageType<T extends ModelProvider> = `refresh${Capitalize<T>}Models`

interface ModelPickerProps<T extends ModelProvider = ModelProvider> {
	defaultModelId: string
	modelsKey: ModelKeys<T>
	configKey: ConfigKeys<T>
	infoKey: InfoKeys<T>
	refreshMessageType: RefreshMessageType<T>
	refreshValues?: Record<string, any>
	serviceName: string
	serviceUrl: string
	recommendedModel: string
	allowCustomModel?: boolean
}

export const ModelPicker = ({
	defaultModelId,
	modelsKey,
	configKey,
	infoKey,
	refreshMessageType,
	refreshValues,
	serviceName,
	serviceUrl,
	recommendedModel,
	allowCustomModel = false,
}: ModelPickerProps) => {
	const [customModelId, setCustomModelId] = useState("")
	const [isCustomModel, setIsCustomModel] = useState(false)
	const [open, setOpen] = useState(false)
	const [value, setValue] = useState(defaultModelId)
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
	const prevRefreshValuesRef = useRef<Record<string, any> | undefined>()

	const { apiConfiguration, [modelsKey]: models, onUpdateApiConfig, setApiConfiguration } = useExtensionState()

	const modelIds = useMemo(
		() => (Array.isArray(models) ? models : Object.keys(models)).sort((a, b) => a.localeCompare(b)),
		[models],
	)

	const { selectedModelId, selectedModelInfo } = useMemo(
		() => normalizeApiConfiguration(apiConfiguration),
		[apiConfiguration],
	)

	const onSelectCustomModel = useCallback(
		(modelId: string) => {
			setCustomModelId(modelId)
			const modelInfo = { id: modelId }
			const apiConfig = { ...apiConfiguration, [configKey]: modelId, [infoKey]: modelInfo }
			setApiConfiguration(apiConfig)
			onUpdateApiConfig(apiConfig)
			setValue(modelId)
			setOpen(false)
			setIsCustomModel(false)
		},
		[apiConfiguration, configKey, infoKey, onUpdateApiConfig, setApiConfiguration],
	)

	const onSelect = useCallback(
		(modelId: string) => {
			const modelInfo = Array.isArray(models)
				? { id: modelId } // For OpenAI models which are just strings
				: models[modelId] // For other models that have full info objects
			const apiConfig = { ...apiConfiguration, [configKey]: modelId, [infoKey]: modelInfo }
			setApiConfiguration(apiConfig)
			onUpdateApiConfig(apiConfig)
			setValue(modelId)
			setOpen(false)
		},
		[apiConfiguration, configKey, infoKey, models, onUpdateApiConfig, setApiConfiguration],
	)

	const debouncedRefreshModels = useMemo(() => {
		return debounce(() => {
			const message = refreshValues
				? { type: refreshMessageType, values: refreshValues }
				: { type: refreshMessageType }
			vscode.postMessage(message)
		}, 100)
	}, [refreshMessageType, refreshValues])

	useMount(() => {
		debouncedRefreshModels()
		return () => debouncedRefreshModels.clear()
	})

	useEffect(() => {
		if (!refreshValues) {
			prevRefreshValuesRef.current = undefined
			return
		}

		// Check if all values in refreshValues are truthy
		if (Object.values(refreshValues).some((value) => !value)) {
			prevRefreshValuesRef.current = undefined
			return
		}

		// Compare with previous values
		const prevValues = prevRefreshValuesRef.current
		if (prevValues && JSON.stringify(prevValues) === JSON.stringify(refreshValues)) {
			return
		}

		prevRefreshValuesRef.current = refreshValues
		debouncedRefreshModels()
	}, [debouncedRefreshModels, refreshValues])

	useEffect(() => setValue(selectedModelId), [selectedModelId])

	return (
		<>
			<div className="font-semibold">模型</div>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button variant="combobox" role="combobox" aria-expanded={open} className="w-full justify-between">
						{value ?? "选择模型..."}
						<CaretSortIcon className="opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="p-0">
					<Command>
						<CommandInput placeholder="搜索模型..." className="h-9" />
						<CommandList>
							<CommandEmpty>未找到模型。</CommandEmpty>
							<CommandGroup>
								{modelIds.map((model) => (
									<CommandItem key={model} value={model} onSelect={onSelect}>
										{model}
										<CheckIcon
											className={cn("ml-auto", value === model ? "opacity-100" : "opacity-0")}
										/>
									</CommandItem>
								))}
							</CommandGroup>
							{allowCustomModel && (
								<CommandGroup heading="自定义">
									<CommandItem
										onSelect={() => {
											setIsCustomModel(true)
											setOpen(false)
										}}>
										+ 添加自定义模型
									</CommandItem>
								</CommandGroup>
							)}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
			{selectedModelId && selectedModelInfo && (
				<ModelInfoView
					selectedModelId={selectedModelId}
					modelInfo={selectedModelInfo}
					isDescriptionExpanded={isDescriptionExpanded}
					setIsDescriptionExpanded={setIsDescriptionExpanded}
				/>
			)}
			{/* <p>
				该扩展程序会自动获取可用的最新模型列表，这些模型来自{" "}
				<VSCodeLink style={{ display: "inline", fontSize: "inherit" }} href={serviceUrl}>
					{serviceName}。
				</VSCodeLink>
				如果您不确定选择哪个模型，AIxCoding Agent 与{" "}
				<VSCodeLink onClick={() => onSelect(recommendedModel)}>{recommendedModel}。</VSCodeLink>
				您也可以尝试搜索“免费”以查找当前可用的免费选项。
			</p> */}
			{allowCustomModel && isCustomModel && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-[var(--vscode-editor-background)] p-6 rounded-lg w-96">
						<h3 className="text-lg font-semibold mb-4">添加自定义模型</h3>
						<input
							type="text"
							className="w-full p-2 mb-4 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
							placeholder="输入模型 ID"
							value={customModelId}
							onChange={(e) => setCustomModelId(e.target.value)}
						/>
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={() => setIsCustomModel(false)}>
								取消
							</Button>
							<Button onClick={() => onSelectCustomModel(customModelId)} disabled={!customModelId.trim()}>
								添加
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	)
}
