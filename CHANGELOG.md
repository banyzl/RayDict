# Changelog

## 0.4.0 — 2026-10-28

Show explicit Wikipedia disambiguation and search choices instead of rendering a disambiguation stub or silently replacing a missing title. Add source-backed form links for Youdao and English Wiktionary, and spelling candidates from Oxford and Dict.cn. Keep the original query and other provider results while selecting a target; restore the original result without a new request. Isolate target caches and cancel superseded selections. Preserve commands, preferences, catalog configuration and local installation behavior.

## 0.3.0 — 2026-10-28

Add a native menu-copy compatibility path for WeChat with clipboard change detection, format restoration and explicit text confirmation. Add a clipboard lookup command and useful selection recovery UI. Add Bing, Dict.cn, Oxford Advanced Learner’s Dictionary, Longman and English Wiktionary as optional providers, preserving existing configuration and enabled order. Handle canonical same-site dictionary redirects and retry lowercase only after an exact-entry 404. Validate SDK support before rebuilding the native settings app.

## Local workflow — 2026-10-26

Add one-shot `install:local` and `update:local` commands using the official distribution build and Raycast default output path. Document stopping development, local update limits, and the difference between a local extension and a Store installation. Keep extension identity, commands, preferences and runtime behavior unchanged.

## 0.2.1 — 2026-10-26

Use the full height of the dictionary detail pane by removing the separate metadata area. Keep the profile in the search dropdown and place reading context/source in the scrolling content footer. Fix literal parentheticals being interpreted as inline math.

## 0.2.0 — 2026-10-26

Added Youdao, Cambridge, Zdic and Wikipedia providers. Added a separate native macOS settings window with a provider catalog, direct enable controls, ordering, profiles, configuration forms and import/export. Added shared revisioned settings, migration from v0.1 and stale-write protection. Added provider, configuration and native settings validation.

## 0.1.0 — 2026-10-26

First native MVP: parallel providers, split view, system selected text, profiles, REST JSON configuration, local history and notebook, pronunciation, optional translation / AI and AnkiConnect.
