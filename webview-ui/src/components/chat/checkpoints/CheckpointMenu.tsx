import { useState, useEffect, useCallback } from "react"
import { CheckIcon, Cross2Icon } from "@radix-ui/react-icons"

import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui"

import { vscode } from "../../../utils/vscode"
import { Checkpoint } from "./schema"

type CheckpointMenuProps = {
	ts: number
	commitHash: string
	currentHash?: string
	checkpoint: Checkpoint
}

export const CheckpointMenu = ({ ts, commitHash, currentHash, checkpoint }: CheckpointMenuProps) => {
	const [portalContainer, setPortalContainer] = useState<HTMLElement>()
	const [isOpen, setIsOpen] = useState(false)
	const [isConfirming, setIsConfirming] = useState(false)

	const isCurrent = currentHash === commitHash
	const isFirst = checkpoint.isFirst

	const isDiffAvailable = !isFirst
	const isRestoreAvailable = !isFirst || !isCurrent

	const onCheckpointDiff = useCallback(() => {
		vscode.postMessage({ type: "checkpointDiff", payload: { ts, commitHash, mode: "checkpoint" } })
	}, [ts, commitHash])

	const onPreview = useCallback(() => {
		vscode.postMessage({ type: "checkpointRestore", payload: { ts, commitHash, mode: "preview" } })
		setIsOpen(false)
	}, [ts, commitHash])

	const onRestore = useCallback(() => {
		vscode.postMessage({ type: "checkpointRestore", payload: { ts, commitHash, mode: "restore" } })
		setIsOpen(false)
	}, [ts, commitHash])

	useEffect(() => {
		// The dropdown menu uses a portal from @shadcn/ui which by default renders
		// at the document root. This causes the menu to remain visible even when
		// the parent ChatView component is hidden (during settings/history view).
		// By moving the portal inside ChatView, the menu will properly hide when
		// its parent is hidden.
		setPortalContainer(document.getElementById("chat-view-portal") || undefined)
	}, [])

	return (
		<div className="flex flex-row gap-1">
			{isDiffAvailable && (
				<Button variant="ghost" size="icon" onClick={onCheckpointDiff} title="查看差异">
					<span className="codicon codicon-diff-single" />
				</Button>
			)}
			{isRestoreAvailable && (
				<Popover
					open={isOpen}
					onOpenChange={(open) => {
						setIsOpen(open)
						setIsConfirming(false)
					}}>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="icon" title="恢复检查点">
							<span className="codicon codicon-history" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" container={portalContainer}>
						<div className="flex flex-col gap-2">
							{!isCurrent && (
								<div className="flex flex-col gap-1 group hover:text-foreground">
									<Button variant="secondary" onClick={onPreview}>
										恢复文件
									</Button>
									<div className="text-muted transition-colors group-hover:text-foreground">
										将您的项目文件恢复到此时创建的快照。
									</div>
								</div>
							)}
							{!isFirst && (
								<div className="flex flex-col gap-1 group hover:text-foreground">
									<div className="flex flex-col gap-1 group hover:text-foreground">
										{!isConfirming ? (
											<Button variant="secondary" onClick={() => setIsConfirming(true)}>
												恢复文件和任务
											</Button>
										) : (
											<>
												<Button variant="default" onClick={onRestore} className="grow">
													<div className="flex flex-row gap-1">
														<CheckIcon />
														<div>确认</div>
													</div>
												</Button>
												<Button variant="secondary" onClick={() => setIsConfirming(false)}>
													<div className="flex flex-row gap-1">
														<Cross2Icon />
														<div>取消</div>
													</div>
												</Button>
											</>
										)}
										{isConfirming ? (
											<div className="text-destructive font-bold">此操作无法撤销。</div>
										) : (
											<div className="text-muted transition-colors group-hover:text-foreground">
												将您的项目文件恢复到此时创建的快照，并删除此点之后的所有消息。
											</div>
										)}
									</div>
								</div>
							)}
						</div>
					</PopoverContent>
				</Popover>
			)}
		</div>
	)
}
