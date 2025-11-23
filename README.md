# 🚑 MediMind: AI-Powered Clinical Triage & Emergency Companion

![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)
![OpenAI](https://img.shields.io/badge/AI-OpenAI%20%2F%20LLM-412991?style=for-the-badge&logo=openai&logoColor=white)
![Status](https://img.shields.io/badge/Status-Prototype-success?style=for-the-badge)

> **MediMind** is a multimodal AI health assistant that bridges the gap between patient symptoms and specialist care. Unlike standard chatbots, it "remembers" patient history to provide context-aware diagnoses, "sees" physical symptoms via image analysis, and instantly detects life-threatening emergencies to trigger a zero-latency SOS protocol.

---

## 📑 Table of Contents
- [The Problem](#-the-problem)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Installation & Setup](#-installation--setup)
- [How to Test (Demo)](#-how-to-test-demo)
- [Project Structure](#-project-structure)

---

## 💡 The Problem
Most symptom checkers are **reactive** and **text-only**. They treat every query as an isolated event, ignoring the progression of symptoms over time (e.g., *Yesterday's fever + Today's stomach pain*). Furthermore, in critical emergencies (Heart Attack, Stroke), chatting with an AI is too slow—patients need immediate intervention.

**MediMind solves this with Contextual Memory, Visual Eyes, and an Emergency Override.**

---

## 🌟 Key Features

### 1. 🧠 Context-Aware Triage (Temporal Logic)
MediMind utilizes a persistent memory module to analyze the **timeline** of symptoms.
* *Scenario:* If you reported a fever yesterday and report a rash today, the AI connects the dots (Viral Infection) rather than treating them as separate issues.
* **Tech:** Recursive prompt engineering with JSON history injection.

### 2. 📸 Multimodal Visual Diagnosis
Patients can upload images of visible symptoms (rashes, wounds, swelling).
* **Tech:** Uses **Multimodal Vision Models** to analyze the image alongside the textual transcript to refine the specialist recommendation (e.g., routing to a Dermatologist instead of a GP).

### 3. 🚨 Guardian Mode (SOS Protocol)
A passive listening system that bypasses the LLM for immediate threat response.
* **Trigger:** Detects acoustic/semantic markers like "Chest pain," "Numb arm," "Can't breathe," or "Seizure."
* **Action:** Instantly locks the UI into **Red Alert Mode**, starts a 10-second countdown, and emits a high-frequency distress beacon.

### 4. 📋 Automated Clinical Handoff (SOAP)
Generates a professional **S.O.A.P. (Subjective, Objective, Assessment, Plan)** report at the click of a button, allowing doctors to review the entire interaction in seconds.

---

## 🏗 System Architecture

The system follows a lightweight, event-driven flow:

```mermaid
graph TD;
    Patient[Patient Input] -->|Voice/Text| Microphone;
    Patient -->|Visual| Camera;
    
    Microphone --> Backend[Flask Backend];
    Camera --> Backend;
    
    Backend -->|Check Keywords| SOS{Critical Trigger?};
    
    SOS -- YES --> RedAlert[🚨 RED ALERT MODE];
    RedAlert --> Beacon[Audio Beacon + Timer];
    
    SOS -- NO --> Context[Context Engine];
    Context -->|Fetch History| DB[(Local JSON DB)];
    DB --> Context;
    
    Context -->|History + New Symptom + Image| AI[OpenAI / LLM API];
    
    AI --> Analysis[Clinical Triage];
    Analysis --> UI[Frontend Display];