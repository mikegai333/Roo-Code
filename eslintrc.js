// import vueParser from './config/vue-eslint-parser'
module.exports = {
	root: true,
	parserOptions: {
		sourceType: "module",
	},
	env: {
		browser: true,
		node: true,
		es6: true,
	},

	extends: ["plugin:aixcoding/essential-vue"],
	ignorePatterns: [
		"node_modules/",
		"build/",
		"dist/",
		"*.min.js",
		"**/__tests__/*.js",
		"**/*.spec.js",
		"**/*.test.js",
	], // 忽略模式
	settings: {
		node: {
			extensions: [".js", ".vue"],
		},
	},
	rules: {},
}
