import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = event.input.command ?? "";
    const isDangerousRm = /^rm\s/.test(command);

    if (isDangerousRm) {
      const confirmed = await ctx.ui.confirm(
        "危险操作",
        `即将执行删除命令:\n\n${command}\n\n确定执行吗？`
      );
      if (!confirmed) {
        return { block: true, reason: "被安全插件阻止" };
      }
    }
  });
}
