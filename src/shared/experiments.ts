export const EXPERIMENT_IDS = {
	DIFF_STRATEGY: "experimentalDiffStrategy",
	SEARCH_AND_REPLACE: "search_and_replace",
	INSERT_BLOCK: "insert_content",
} as const

export type ExperimentKey = keyof typeof EXPERIMENT_IDS
export type ExperimentId = valueof<typeof EXPERIMENT_IDS>

export interface ExperimentConfig {
	name: string
	description: string
	enabled: boolean
}

type valueof<X> = X[keyof X]

export const experimentConfigsMap: Record<ExperimentKey, ExperimentConfig> = {
	DIFF_STRATEGY: {
		name: "使用实验性统一差异策略",
		description:
			"启用实验性统一差异策略。此策略可能会减少由模型错误引起的重试次数，但可能会导致意外行为或不正确的编辑。仅当您了解风险并愿意仔细审查所有更改时才启用。",
		enabled: false,
	},
	SEARCH_AND_REPLACE: {
		name: "使用实验性搜索和替换工具",
		description: "启用实验性搜索和替换工具，允许插件在一个请求中替换搜索词的多个实例。",
		enabled: false,
	},
	INSERT_BLOCK: {
		name: "使用实验性插入内容工具",

		description: "启用实验性插入内容工具，允许插件在特定行号插入内容，而无需创建差异。",
		enabled: false,
	},
}

export const experimentDefault = Object.fromEntries(
	Object.entries(experimentConfigsMap).map(([_, config]) => [
		EXPERIMENT_IDS[_ as keyof typeof EXPERIMENT_IDS] as ExperimentId,
		config.enabled,
	]),
) as Record<ExperimentId, boolean>

export const experiments = {
	get: (id: ExperimentKey): ExperimentConfig | undefined => {
		return experimentConfigsMap[id]
	},
	isEnabled: (experimentsConfig: Record<ExperimentId, boolean>, id: ExperimentId): boolean => {
		return experimentsConfig[id] ?? experimentDefault[id]
	},
} as const

// Expose experiment details for UI - pre-compute from map for better performance
export const experimentLabels = Object.fromEntries(
	Object.entries(experimentConfigsMap).map(([_, config]) => [
		EXPERIMENT_IDS[_ as keyof typeof EXPERIMENT_IDS] as ExperimentId,
		config.name,
	]),
) as Record<string, string>

export const experimentDescriptions = Object.fromEntries(
	Object.entries(experimentConfigsMap).map(([_, config]) => [
		EXPERIMENT_IDS[_ as keyof typeof EXPERIMENT_IDS] as ExperimentId,
		config.description,
	]),
) as Record<string, string>
