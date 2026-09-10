import { useStore } from '../../stores/useStore'
import type { GenerateParams } from '../../types'

/**
 * Standalone box for TTS models whose `alt_prompt` is a voice DESCRIPTION or a
 * delivery INSTRUCTION rather than a reference transcript — Qwen3 Voice Design
 * and Qwen3 Custom Voice.
 *
 * Those models are instruction-driven and had no surface for the field at all:
 * `AudioModeSection` (which carries the per-voice transcript box) only renders
 * when the model declares `audio_prompt_type_sources`, and Voice Design has no
 * reference-audio slot, so it declares none. The field was reachable only by
 * `alt_prompt` happening to carry over from another model — which is exactly
 * how it was discovered on 2026-08-26.
 *
 * Models opt in with `voice_instruction_label` in their model_def (allowlisted
 * into /api/v1/model-options); no label means this renders nothing.
 */
export function VoiceInstructionBox() {
  const modelOptions = useStore(s => s.modelOptions)
  const params = useStore(s => s.params)
  const setParam = useStore(s => s.setParam)

  const opts = modelOptions as {
    voice_instruction_label?: string
    voice_instruction_placeholder?: string
  } | null
  const label = opts?.voice_instruction_label
  if (!label) return null

  const value = (params.alt_prompt as string) || ''

  return (
    <div className="space-y-1">
      <label className="text-[9px] text-text-muted uppercase tracking-wider block">
        {label}
      </label>
      <textarea
        rows={3}
        placeholder={opts?.voice_instruction_placeholder || ''}
        value={value}
        onChange={e => setParam('alt_prompt' as keyof GenerateParams, e.target.value)}
        className="w-full bg-bg-tertiary border border-border rounded px-2 py-1 text-[10px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue resize-none"
      />
    </div>
  )
}
