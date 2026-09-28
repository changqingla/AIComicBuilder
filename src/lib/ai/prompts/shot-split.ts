export function buildShotSplitPrompt(
  screenplay: string,
  characters: string,
  characterVisualHints?: Array<{ name: string; visualHint: string }>,
  colorPalette?: string,
  characterPerformanceStyles?: Array<{
    name: string;
    performanceStyle: string;
  }>,
): string {
  const hintBlock = characterVisualHints?.length
    ? `\n--- 角色视觉标识（必须使用）---\n${characterVisualHints.map((c) => `${c.name}：${c.visualHint}`).join("\n")}\n--- 结束 ---\n\n关键要求：当角色出现在 sceneDescription、motionScript 或 videoScript 中时，必须在角色名后用括号标注视觉标识，且必须完全使用上方提供的原文。示例：天枢真君（银发金瞳）。绝不自行编造替代描述——始终复用上方提供的准确标识文本。`
    : "";

  return `将此剧本拆解为专业的镜头列表，针对 AI 视频生成进行优化。每个镜头只输出场景、动作、运镜、时长、对白和出场角色等元数据。用 sceneDescription 描述环境，motionScript 描述动作节拍，videoScript 概括视频内容。首尾帧与参考图的图像提示词由后续步骤单独生成。

--- 剧本 ---
${screenplay}
--- 结束 ---

--- 角色参考描述 ---
${characters}
--- 结束 ---
${hintBlock}
重要：引用角色时使用其准确名称，确保 sceneDescription 中的角色描述与上方的角色参考一致。${characterPerformanceStyles?.length ? `\n\n--- 角色表演风格 ---\n${characterPerformanceStyles.map((c) => `${c.name}：${c.performanceStyle}`).join("\n")}\n--- 结束 ---\n\n使用每个角色的表演风格来指导其在 motionScript 和 videoScript 中的表情、姿势和手势。` : ""}

重要：你的输出语言必须与上方剧本的语言一致。如果是中文剧本，则所有字段使用中文（cameraDirection 除外）。${colorPalette ? `\n\n## 全局色彩方案\n所有镜头必须使用此色彩方案：${colorPalette}。场景描述的色彩应与此调色板一致。\n` : ""}`;
}
