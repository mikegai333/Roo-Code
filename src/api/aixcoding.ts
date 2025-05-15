import axios from "axios"
import * as vscode from "vscode"

let configuration: any
let isInitialized = false
let apiKey: string, baseApi: string
const extension = vscode.extensions.getExtension("bocsoft.aixcoding")
const version = extension?.packageJSON.version

export interface codeUsage {
	projectName: string
	filePath: string
	eventType: string
	originalLines: number
	addedLines: number
	deletedLines: number
}

export interface codeUsageUpdate {
	projectName: string
	filePath: string
	eventType: string
	status: number
}

export interface toolUsage {
	projectName: string
	filePath: string
	toolUseName: string
	toolParam?: string
}

export function initializeConfiguration(context: vscode.ExtensionContext) {
	if (isInitialized) {
		return
	}
	configuration = context.globalState
	isInitialized = true
	apiKey = configuration.get("openAiApiKey")
	baseApi = configuration.get("baseApi")
}

export function getConfiguration() {
	return configuration
}

// 获取模板
export async function getTemplates(apiConfig: any) {
	try {
		const { apiKey, baseApi } = apiConfig
		const url = `${baseApi}/api/v1/templates`

		const options = {
			params: {
				token: apiKey,
			},
			headers: {
				Token: apiKey,
				"Content-Type": "application/json",
			},
		}

		const response = await axios.get(url, options)
		if (response.data && response.data.data) {
			return response.data.data
		}
	} catch (error) {
		console.error("获取模板发生错误：", error)
		return [
			{ name: "功能1", content: "功能1的描述", id: "1" },
			{ name: "功能2", content: "功能2的描述", id: "2" },
			{ name: "功能3", content: "功能3的描述", id: "3" },
		]
	}
}

// 报告插件使用
export function reportPluginUsage(reportObj: any) {
	const url = baseApi + "/api/v1/report/plugin"
	const options = {
		token: apiKey,
		version: version,
		ideName: "vscode",
		ideVersion: vscode.version,
		...reportObj,
	}
	axios
		.post(url, options, { headers: { Token: apiKey, "Content-Type": "application/json" } })
		.then((res) => {
			console.log("报告插件使用成功: ", res.data)
		})
		.catch((err) => {
			console.log("报告插件使用失败: ", err)
		})
}

// 报告插件修改文件情况
export function reportCodeUsage(reportObj: codeUsage) {
	const url = baseApi + "/api/v1/report/agent/usage/code"
	const options = {
		token: apiKey,
		version: version,
		ideName: "vscode",
		ideVersion: vscode.version,
		...reportObj,
	}
	axios
		.post(url, options, { headers: { Token: apiKey, "Content-Type": "application/json" } })
		.then((res) => {
			console.log("报告代码使用成功: ", res.data)
		})
		.catch((err) => {
			console.log("报告代码使用失败: ", err)
		})
}

// 更新插件修改文件情况
export function updateCodeUsage(reportObj: codeUsageUpdate) {
	const url = baseApi + "/api/v1/report/agent/usage/code/update"
	const options = {
		token: apiKey,
		version: version,
		ideName: "vscode",
		ideVersion: vscode.version,
		...reportObj,
	}
	axios
		.post(url, options, { headers: { Token: apiKey, "Content-Type": "application/json" } })
		.then((res) => {
			console.log("更新代码使用情况成功: ", res.data)
		})
		.catch((err) => {
			console.log("更新代码使用情况失败: ", err)
		})
}

// 报告工具使用
export function reportToolUsage(reportObj: toolUsage) {
	const url = baseApi + "/api/v1/report/agent/usage/tool"
	const options = {
		token: apiKey,
		version: version,
		ideName: "vscode",
		ideVersion: vscode.version,
		...reportObj,
	}
	axios
		.post(url, options, { headers: { Token: apiKey, "Content-Type": "application/json" } })
		.then((res) => {
			console.log("报告工具使用成功: ", res.data)
		})
		.catch((err) => {
			console.log("报告工具使用失败: ", err)
		})
}
