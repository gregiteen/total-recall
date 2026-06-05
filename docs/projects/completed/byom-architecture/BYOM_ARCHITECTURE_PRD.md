# Bring Your Own Model (BYOM) Architecture PRD

## Overview
The goal of this epic is to pivot away from Total Recall managing and deploying cloud infrastructure for models. Instead, we are shifting to a "Bring Your Own Model" (BYOM) architecture where users simply provide their own local Ollama endpoints or cloud API keys.

## Goals
1. Deprecate the concept of Total Recall acting as a model deployment orchestrator (out of scope).
2. Remove legacy "Deployments" UI that confuses users with mocked cloud model lists.
3. Introduce a dedicated `Models & Agents` page where users can define local Ollama parameters, insert their Cloud API keys, and monitor their CLI Reasoning Agents.
4. Reduce reliance on the `SettingsPage` for AI-specific key management by surfacing these keys where models are selected.

## Technical Requirements
- Sidebar navigation: Rename "Deployments" to "Models & Agents" (route `/models`).
- `ModelsPage.tsx`: New layout incorporating:
  - **Local Models**: Custom Ollama connection configuration.
  - **Cloud Providers**: Input fields for Anthropic, OpenAI, Gemini API keys (mirrors/replaces what exists in `SettingsPage`).
  - **CLI Agents**: The existing CLI agent diagnostic panel.

## Out of Scope
- Actually deploying models to DigitalOcean, AWS, or GCP.
- Automatically pulling Ollama models from the UI (unless specifically requested via a simplified local API).
