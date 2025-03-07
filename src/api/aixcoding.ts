import axios from "axios"

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
			{ name: "功能1功能1功能1", content: "功能1的描述", id: "1" },
			{ name: "功能1功能2功能2", content: "功能2的描述", id: "2" },
			{ name: "功能3功能3功能3", content: "功能3的描述", id: "3" },
		]
	}
}
