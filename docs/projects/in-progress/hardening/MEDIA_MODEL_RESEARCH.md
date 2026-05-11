# Total Recall — Media Model Research (May 2026)

- **Plane**: Projects
- **Last Updated**: 2026-05-11
- **Summary**: Comprehensive research on open-source media generation models viable for the Oracle ARM VM (4 OCPUs, 24GB RAM). Organized by category with quality/efficiency tiers to support user-selectable model profiles during setup.

---

## Hardware Context

All models must run on the Oracle Always Free Ampere A1 VM:
- **CPU:** 4 OCPUs (ARM aarch64, Ampere Altra)
- **RAM:** 24 GB total (~6.3 GB available for on-demand media models after Gemma 4 + Kokoro + OS)
- **GPU:** None
- **Storage:** 200 GB persistent SSD

Models are loaded **one at a time** into the ~6.3GB headroom, generate output, then unload. Quality and speed trade off against each other on CPU-only hardware.

---

## Proposed Architecture: User-Selectable Model Profiles

During `npx total-recall deploy`, the user selects a **Media Profile** that determines which models are pulled and configured. This avoids forcing a one-size-fits-all tradeoff between quality and speed.

| Profile | Philosophy | Storage Cost | Target User |
|:---|:---|:---|:---|
| **🏆 Quality** | Best-in-class output, slow generation. Use the largest models that fit in 6.3GB. | ~25 GB | Creators who want premium async media overnight |
| **⚡ Balanced** | Good quality, reasonable speed. Mid-size models with faster turnaround. | ~12 GB | General users who want media without long waits |
| **🪶 Lightweight** | Fastest possible generation, acceptable quality. Tiny models. | ~4 GB | Resource-conscious users, quick prototyping |
| **❌ None** | No media models. Voice-only (Kokoro is always resident). | 0 GB | Users who only need the reasoning kernel |

---

## 1. Text-to-Speech (Voice)

> Kokoro is the recommended always-resident model across all profiles. This section documents alternatives.

### 1.1 Kokoro-82M ✅ (Current Default — All Profiles)

| Attribute | Value |
|:---|:---|
| **Parameters** | 82M |
| **Architecture** | StyleTTS 2 + ISTFTNet vocoder (decoder-only) |
| **RAM** | ~200 MB |
| **CPU Speed** | Real-time or faster on 4 ARM cores |
| **Quality** | Competitive with models 10x its size; top of TTS Arena |
| **License** | Apache 2.0 |
| **Format** | GGUF / ONNX |
| **Verdict** | **No reason to replace.** Best quality-per-parameter TTS model available in 2026. |

### 1.2 Alternatives Evaluated

| Model | Params | RAM | Speed | Quality | Best For | License |
|:---|:---|:---|:---|:---|:---|:---|
| **Piper** | Varies (<100M) | <100 MB | Real-time | Good (not natural) | Extreme edge (Raspberry Pi) | MIT |
| **Kitten TTS** | ~25 MB int8 | ~50 MB | Real-time | Acceptable | Ultra-minimal footprint | Open Source |
| **CosyVoice 2 (0.5B)** | 500M | ~1 GB | 150ms streaming | Excellent | Low-latency voice agents | Open Source |
| **MOSS-TTS-Nano** | 100M | ~200 MB | Real-time on 4 cores | Good | CPU-first multilingual | Apache 2.0 |

**Recommendation:** Kokoro-82M remains the clear winner. CosyVoice 2 is the only model that would be an upgrade in quality, but at 5x the RAM cost — not worth it when Kokoro already delivers excellent results.

---

## 2. Sound Effect Generation

### 2.1 MOSS-SoundEffect (8B) — Current PRD Default

| Attribute | Value |
|:---|:---|
| **Parameters** | 8B |
| **Architecture** | MossTTSDelay (autoregressive, RVQ audio tokens) |
| **Audio Tokenizer** | MOSS-Audio-Tokenizer (1.6B params, Cat/Causal) |
| **RAM (Q4)** | ~5.0 GB |
| **CPU Speed** | ~30–90s per clip (estimated) |
| **Quality** | High-fidelity. Broad taxonomy: nature, urban, creatures, human actions. Controllable duration. |
| **License** | Apache 2.0 |
| **Verdict** | **Best quality sound effects available.** Fits in 6.3GB headroom. The heavyweight option. |

### 2.2 Stable Audio Open Small (341M) — Lightweight Alternative

| Attribute | Value |
|:---|:---|
| **Parameters** | 341M |
| **Architecture** | Latent Diffusion (DiT) |
| **RAM (Quantized)** | ~2.9 GB (Int8 DiT + FP16 autoencoder) |
| **RAM (FP32)** | ~6.5 GB (too tight for our headroom) |
| **CPU Speed** | ~7–8s per 11s clip on premium mobile ARM; estimated ~15–30s on Ampere A1 |
| **Quality** | Good. Designed for sound effects + short music. Not as broad as MOSS-SoundEffect taxonomy. |
| **License** | Stability AI Community License |
| **ARM Optimization** | Explicitly optimized by Arm Ltd. using KleidiAI micro-kernels and LiteRT |
| **Verdict** | **Best speed/quality ratio.** 15x smaller than MOSS, ARM-native optimizations, generates in seconds not minutes. |

### 2.3 Stable Audio Open (1.2B) — Mid-Tier

| Attribute | Value |
|:---|:---|
| **Parameters** | 1.2B |
| **RAM** | ~3.5 GB (quantized), peaks at ~6.5 GB during decoding |
| **CPU Speed** | Moderate (~1–3 min per clip estimated) |
| **Quality** | Better than Small, worse than MOSS-SoundEffect 8B |
| **License** | Stability AI Community License |
| **Verdict** | Peak memory may exceed headroom during decoding. Risky fit. |

### 2.4 AudioCraft / AudioGen (Meta)

| Attribute | Value |
|:---|:---|
| **Parameters** | 1.5B+ |
| **RAM** | Heavy, memory-hungry, frequently OOM on constrained hardware |
| **License** | MIT |
| **Verdict** | **Not recommended.** Too memory-hungry for this hardware class. |

### 2.5 Sound Effects — Profile Mapping

| Profile | Model | RAM | Speed | Quality |
|:---|:---|:---|:---|:---|
| **🏆 Quality** | MOSS-SoundEffect 8B (Q4) | ~5.0 GB | ~30–90s | ⭐⭐⭐⭐⭐ |
| **⚡ Balanced** | Stable Audio Open 1.2B (quantized) | ~3.5 GB | ~1–3 min | ⭐⭐⭐⭐ |
| **🪶 Lightweight** | Stable Audio Open Small (Int8) | ~2.9 GB | ~15–30s | ⭐⭐⭐ |

---

## 3. Text-to-Image Generation

### 3.1 Z-Image-Turbo (6B) — Current PRD Default

| Attribute | Value |
|:---|:---|
| **Parameters** | 6B |
| **Architecture** | Diffusion Transformer (DiT), single-stream, 8 NFE steps |
| **RAM (Q4)** | ~4.0 GB |
| **CPU Speed** | ~10–25 min per 1024×1024 image |
| **Quality** | Excellent. Photorealistic, bilingual text rendering, strong prompt adherence. |
| **License** | Apache 2.0 |
| **Source** | Alibaba Tongyi Lab (Nov 2025) |
| **Inference Engine** | sd.cpp (C++ native, GGUF support) or diffusers |
| **Verdict** | **Best quality text-to-image that fits in 6.3GB.** Slow on CPU, but output quality is near state-of-the-art. |

### 3.2 Stable Diffusion 1.5 via sd.cpp — Lightweight Alternative

| Attribute | Value |
|:---|:---|
| **Parameters** | ~860M |
| **Architecture** | U-Net Diffusion (legacy, not DiT) |
| **RAM (Q4/Q8)** | ~2–3 GB |
| **CPU Speed** | ~2–5 min per 512×512 image via sd.cpp |
| **Quality** | Good for its size, but noticeably below modern DiT models. Established fine-tune ecosystem (thousands of LoRA/checkpoints). |
| **License** | CreativeML Open RAIL-M |
| **Inference Engine** | sd.cpp (C/C++, GGUF, ARM-optimized) |
| **Verdict** | **Fastest practical option on CPU.** Much lower quality ceiling than Z-Image-Turbo, but 5–10x faster generation. Massive community checkpoint ecosystem. |

### 3.3 SDXL via sd.cpp

| Attribute | Value |
|:---|:---|
| **Parameters** | ~3.5B (base) + ~6.6B (refiner) |
| **RAM** | ~4–5 GB (base Q4 only, no refiner) |
| **CPU Speed** | ~8–15 min per 1024×1024 |
| **Quality** | Significantly better than SD 1.5, close to Z-Image-Turbo |
| **License** | CreativeML Open RAIL++-M |
| **Verdict** | Viable middle ground. Base model alone fits; refiner does not. |

### 3.4 FLUX.1 Schnell

| Attribute | Value |
|:---|:---|
| **Parameters** | 12B |
| **RAM** | ~8–10 GB (Q4) — **exceeds 6.3GB headroom** |
| **Quality** | State-of-the-art |
| **Verdict** | **Does not fit.** Would require unloading Gemma 4 entirely. Not viable for our architecture. |

### 3.5 Text-to-Image — Profile Mapping

| Profile | Model | RAM | Speed | Quality |
|:---|:---|:---|:---|:---|
| **🏆 Quality** | Z-Image-Turbo 6B (Q4) | ~4.0 GB | ~10–25 min | ⭐⭐⭐⭐⭐ |
| **⚡ Balanced** | SDXL Base (Q4, no refiner) | ~4.5 GB | ~8–15 min | ⭐⭐⭐⭐ |
| **🪶 Lightweight** | SD 1.5 via sd.cpp (Q8) | ~2.5 GB | ~2–5 min | ⭐⭐⭐ |

---

## 4. Music Generation

### 4.1 ACE-Step v1.5 — Current PRD Default

| Attribute | Value |
|:---|:---|
| **Parameters** | ~2B (estimated) |
| **Architecture** | Chain-of-Thought planning + Diffusion Transformer (DiT) audio decoder |
| **RAM** | ~1.5 GB (Q4 estimated), up to ~4 GB with CPU offloading |
| **CPU Speed** | ~5–15 min per clip |
| **Quality** | High. Multi-language lyrics, stem separation, vocal cloning, up to 10 min tracks. |
| **License** | Open Source |
| **Release** | January 2026 |
| **Verdict** | **Best dedicated music model that fits.** Small enough to leave room for other operations. Rich feature set. |

### 4.2 Stable Audio Open Small (341M) — Dual-Purpose Alternative

| Attribute | Value |
|:---|:---|
| **Parameters** | 341M |
| **RAM (Int8)** | ~2.9 GB |
| **CPU Speed** | ~15–30s per 11s clip (estimated on Ampere) |
| **Quality** | Good for short loops and ambient music. Cannot do lyrics or long-form composition. |
| **License** | Stability AI Community License |
| **Verdict** | Can serve **double duty** as both SFX + short music in the Lightweight profile, saving storage. |

### 4.3 Stable Audio Open (1.2B) — Mid-Tier

| Attribute | Value |
|:---|:---|
| **Parameters** | 1.2B |
| **RAM** | ~3.5 GB quantized |
| **Quality** | Better than Small for music, still no lyrics |
| **Verdict** | Viable but doesn't add enough over ACE-Step to justify. |

### 4.4 Music — Profile Mapping

| Profile | Model | RAM | Speed | Quality |
|:---|:---|:---|:---|:---|
| **🏆 Quality** | ACE-Step v1.5 | ~1.5–4 GB | ~5–15 min | ⭐⭐⭐⭐⭐ |
| **⚡ Balanced** | ACE-Step v1.5 | ~1.5–4 GB | ~5–15 min | ⭐⭐⭐⭐⭐ |
| **🪶 Lightweight** | Stable Audio Open Small | ~2.9 GB | ~15–30s | ⭐⭐⭐ |

> **Note:** ACE-Step is the clear winner for music across Quality and Balanced profiles. It's small enough that there's no reason to downgrade unless the user wants the absolute fastest turnaround with Stable Audio Open Small doing double duty for both SFX + music.

---

## 5. Complete Profile Summary

### 🏆 Quality Profile (~25 GB storage)

| Category | Model | Params | RAM | Speed |
|:---|:---|:---|:---|:---|
| Voice | Kokoro-82M | 82M | 0.2 GB (resident) | Real-time |
| Sound Effects | MOSS-SoundEffect 8B | 8B | 5.0 GB | 30–90s |
| Images | Z-Image-Turbo 6B | 6B | 4.0 GB | 10–25 min |
| Music | ACE-Step v1.5 | ~2B | 1.5–4 GB | 5–15 min |

**Total on-demand models stored:** ~25 GB on disk. Max ~5 GB in RAM at any time. Best possible output quality, longest generation times.

### ⚡ Balanced Profile (~18 GB storage)

| Category | Model | Params | RAM | Speed |
|:---|:---|:---|:---|:---|
| Voice | Kokoro-82M | 82M | 0.2 GB (resident) | Real-time |
| Sound Effects | Stable Audio Open 1.2B | 1.2B | 3.5 GB | 1–3 min |
| Images | SDXL Base (Q4) | 3.5B | 4.5 GB | 8–15 min |
| Music | ACE-Step v1.5 | ~2B | 1.5–4 GB | 5–15 min |

**Total on-demand models stored:** ~18 GB on disk. Max ~4.5 GB in RAM at any time. Good quality, noticeably faster.

### 🪶 Lightweight Profile (~8 GB storage)

| Category | Model | Params | RAM | Speed |
|:---|:---|:---|:---|:---|
| Voice | Kokoro-82M | 82M | 0.2 GB (resident) | Real-time |
| Sound Effects | Stable Audio Open Small | 341M | 2.9 GB | 15–30s |
| Images | SD 1.5 via sd.cpp | 860M | 2.5 GB | 2–5 min |
| Music | Stable Audio Open Small (shared) | 341M | 2.9 GB (shared) | 15–30s |

**Total on-demand models stored:** ~8 GB on disk. Max ~2.9 GB in RAM. Fastest turnaround, acceptable quality. Stable Audio Open Small does double duty for SFX + music.

---

## 6. CLI Implementation Sketch

```bash
$ npx total-recall deploy

  🧠 Total Recall — Sovereign OS Deployment

  Select your Media Profile:

  🏆 Quality    — Best output, slow generation (25 GB disk)
                   MOSS-SoundEffect 8B · Z-Image-Turbo 6B · ACE-Step 1.5
  ⚡ Balanced   — Good quality, faster (18 GB disk)
                   Stable Audio Open · SDXL · ACE-Step 1.5
  🪶 Lightweight — Fast generation, good enough (8 GB disk)
                   Stable Audio Open Small · SD 1.5 · SA Open Small
  ❌ None        — Voice only, no media generation (0 GB extra)

  > Your choice: [Quality / Balanced / Lightweight / None]
```

Users can change profiles later via `total-recall config set media-profile balanced`, which pulls/removes models as needed.

---

## 7. Licensing Summary

| Model | License | Commercial Use | Notes |
|:---|:---|:---|:---|
| Kokoro-82M | Apache 2.0 | ✅ Yes | Fully permissive |
| MOSS-SoundEffect 8B | Apache 2.0 | ✅ Yes | Fully permissive |
| Z-Image-Turbo 6B | Apache 2.0 | ✅ Yes | Fully permissive |
| ACE-Step v1.5 | Open Source | ✅ Yes | Check specific license terms |
| Stable Audio Open Small | Stability Community | ⚠️ Conditional | Non-commercial by default; commercial license available |
| Stable Audio Open 1.2B | Stability Community | ⚠️ Conditional | Same as above |
| SD 1.5 | CreativeML Open RAIL-M | ✅ Yes | Permissive with use restrictions |
| SDXL | CreativeML Open RAIL++-M | ✅ Yes | Permissive with use restrictions |

> ⚠️ **Licensing flag:** Stable Audio Open (both sizes) uses the Stability AI Community License, which restricts commercial use unless a separate commercial license is obtained. This affects the **Balanced** and **Lightweight** profiles. The **Quality** profile uses exclusively Apache 2.0 / permissive licenses.

---

## 8. Open Questions

1. **Should Stable Audio Open Small replace MOSS-SoundEffect in the Balanced profile despite the licensing concern?** The Apache-licensed MOSS 8B is the safe default, but Stable Audio Open Small is 23x smaller and ARM-optimized.

2. **Should we support a "Custom" profile where users pick individual models per category?** More flexible but increases CLI complexity and support surface.

3. **Are there upcoming Apache 2.0 licensed sound effect models in the ~500M–2B range that would slot perfectly into the Balanced profile without licensing concerns?** The MOSS-TTS-Nano (100M) exists but is TTS-focused, not SFX-focused.

4. **Should image generation be optional even within Quality profile?** At 10–25 min per image on CPU, some users may prefer to skip it entirely and use external APIs for images only.
