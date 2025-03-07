import {
	ApiConfiguration,
	glamaDefaultModelId,
	openRouterDefaultModelId,
	unboundDefaultModelId,
} from "../../../src/shared/api"
import { ModelInfo } from "../../../src/shared/api"
export function validateApiConfiguration(apiConfiguration?: ApiConfiguration): string | undefined {
	if (apiConfiguration) {
		switch (apiConfiguration.apiProvider) {
			case "anthropic":
				if (!apiConfiguration.apiKey) {
					return "您必须提供有效的 API 密钥或选择其他提供商。"
				}
				break
			case "glama":
				if (!apiConfiguration.glamaApiKey) {
					return "您必须提供有效的 API 密钥或选择其他提供商。"
				}
				break
			case "bedrock":
				if (!apiConfiguration.awsRegion) {
					return "您必须选择一个区域以使用 AWS Bedrock。"
				}
				break
			case "openrouter":
				if (!apiConfiguration.openRouterApiKey) {
					return "您必须提供有效的 API 密钥或选择其他提供商。"
				}
				break
			case "vertex":
				if (!apiConfiguration.vertexProjectId || !apiConfiguration.vertexRegion) {
					return "您必须提供有效的 Google Cloud 项目 ID 和区域。"
				}
				break
			case "gemini":
				if (!apiConfiguration.geminiApiKey) {
					return "您必须提供有效的 API 密钥或选择其他提供商。"
				}
				break
			case "openai-native":
				if (!apiConfiguration.openAiNativeApiKey) {
					return "您必须提供有效的 API 密钥或选择其他提供商。"
				}
				break
			case "mistral":
				if (!apiConfiguration.mistralApiKey) {
					return "您必须提供有效的 API 密钥或选择其他提供商。"
				}
				break
			case "openai":
				if (
					!apiConfiguration.openAiBaseUrl ||
					!apiConfiguration.openAiApiKey ||
					!apiConfiguration.openAiModelId
				) {
					return "您必须提供有效的基准 URL、API 密钥和模型 ID。"
				}
				break
			case "ollama":
				if (!apiConfiguration.ollamaModelId) {
					return "您必须提供有效的模型 ID。"
				}
				break
			case "lmstudio":
				if (!apiConfiguration.lmStudioModelId) {
					return "您必须提供有效的模型 ID。"
				}
				break
			case "vscode-lm":
				if (!apiConfiguration.vsCodeLmModelSelector) {
					return "您必须提供有效的模型选择器。"
				}
				break
		}
	}
	return undefined
}

export function validateModelId(
	apiConfiguration?: ApiConfiguration,
	glamaModels?: Record<string, ModelInfo>,
	openRouterModels?: Record<string, ModelInfo>,
	unboundModels?: Record<string, ModelInfo>,
): string | undefined {
	if (apiConfiguration) {
		switch (apiConfiguration.apiProvider) {
			case "glama":
				const glamaModelId = apiConfiguration.glamaModelId || glamaDefaultModelId // in case the user hasn't changed the model id, it will be undefined by default
				if (!glamaModelId) {
					return "您必须提供模型 ID。"
				}
				if (glamaModels && !Object.keys(glamaModels).includes(glamaModelId)) {
					// even if the model list endpoint failed, extensionstatecontext will always have the default model info
					return "您提供的模型 ID 不可用。请选择其他模型。"
				}
				break
			case "openrouter":
				const modelId = apiConfiguration.openRouterModelId || openRouterDefaultModelId // in case the user hasn't changed the model id, it will be undefined by default
				if (!modelId) {
					return "您必须提供模型 ID。"
				}
				if (openRouterModels && !Object.keys(openRouterModels).includes(modelId)) {
					// even if the model list endpoint failed, extensionstatecontext will always have the default model info
					return "您提供的模型 ID 不可用。请选择其他模型。"
				}
				break
			case "unbound":
				const unboundModelId = apiConfiguration.unboundModelId || unboundDefaultModelId
				if (!unboundModelId) {
					return "您必须提供模型 ID。"
				}
				if (unboundModels && !Object.keys(unboundModels).includes(unboundModelId)) {
					// even if the model list endpoint failed, extensionstatecontext will always have the default model info
					return "您提供的模型 ID 不可用。请选择其他模型。"
				}
				break
		}
	}
	return undefined
}
