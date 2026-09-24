# Dual Subtitle

Watch Netflix with dual subtitles in Chrome or Edge on Windows. The first subtitle language follows Netflix's own subtitle selection; choose the second language in the extension. You need a Netflix account with access to the title you want to watch.

**Currently supports Netflix only.** Other streaming websites and the Netflix mobile or desktop apps are not supported.

## Installation

Download the v0.1.0 package for your browser:

- [Download for Chrome](releases/v0.1.0/dual-0.1.0-chrome.zip?raw=true)
- [Download for Edge](releases/v0.1.0/dual-0.1.0-edge.zip?raw=true)
- [SHA-256 checksums](releases/v0.1.0/SHA256SUMS.txt)

1. Download the ZIP using one of the links above. Access requires permission to this private GitHub repository.
2. Extract the ZIP into a permanent folder. Keep this folder after installation.
3. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Open or refresh your Netflix playback page. Pin Dual Subtitle to the browser toolbar for easy access.

If you already have a project build, you can load `.output/chrome-mv3` in Chrome or `.output/edge-mv3` in Edge directly.

## Enable and change subtitles

1. Choose a subtitle language in the Netflix player, such as Japanese.
2. Click the Dual Subtitle toolbar icon. The first subtitle language follows Netflix and cannot be changed independently in the extension.
3. Choose a different language for the second subtitles, such as English.
4. Click **Enable dual subtitles (experimental)**. Both lines appear after the subtitles finish loading and synchronization is established.

The first subtitles follow changes made in Netflix, including standard and SDH variants. Turning Netflix subtitles off suspends dual subtitles and prompts you to select a language. Turning them back on allows dual subtitles to resume automatically.

The Start button is disabled while dual subtitles are loading or active. To change the second language, first click **Disable and restore Netflix subtitles**, choose the new language, then enable dual subtitles again. The two languages must be different.

Available languages come from the current title. The extension does not provide machine translation or external subtitle imports.

## Style and fonts

Adjust font size, background opacity, text shadow, and font in the popup. Both subtitle lines share the same style. The default background is transparent, with text shadow enabled. Changes are saved automatically and immediately applied to the preview and active subtitles. Use the reset button to restore the default style.

The preview shows sample sentences in your selected languages, rather than dialogue from the current title. If a sample is unavailable, it displays the language name instead.

To use fonts installed on your computer:

1. Open the font settings page using the local font button in the popup.
2. Start or refresh the font scan and grant permission when prompted by your browser.
3. Return to Netflix, reopen the extension, and select a font from the dropdown.

Common Chinese and Japanese fonts display their native names. Your operating system may ignore font styling inside dropdown menus, so use the style preview to check the result. Unsupported characters use fallback fonts. Default fonts remain available if scanning fails or permission is denied. Scan again after installing or removing fonts to update the list.

## Interface language

Choose Simplified Chinese or English at the top of the popup or font settings page. Your choice is saved automatically. On first use, the interface language follows your browser language.

Switching languages reloads only the extension interface and does not disable active subtitles. Apply any pending subtitle selection before switching.

## Ads, page refreshes, and the next episode

Dual subtitles pause during ads. After an ad, Netflix's own subtitles remain visible until enough matching dialogue is available to synchronize and resume dual subtitles. You do not need to move the mouse or show the playback controls. Scenes without dialogue may require a longer wait.

The extension remembers the second language and whether dual subtitles are enabled when you refresh the page or move to the next episode. The first language continues to follow Netflix. If the second language is missing, its subtitle variant cannot be matched, or both languages are the same, open the extension and choose another language. Manually disabling dual subtitles keeps them disabled after a refresh.

## Updating

Replace the files in your existing installation folder with the contents of the new ZIP. Click **Reload** on the extension management page, then refresh Netflix. Keep the same installation folder and avoid uninstalling the old extension first to help preserve your local settings.

## Troubleshooting

- **Not connected or no languages listed:** Open a Netflix playback page, refresh it, and use the extension's recheck button. Refresh Netflix after installing or updating the extension as well.
- **First language is empty or language controls are disabled:** Enable a subtitle language in the Netflix player first.
- **Only Netflix subtitles appear after an ad:** Wait for dialogue so synchronization can finish. If the extension reports synchronization failure, manually seek using the progress bar to recover.
- **Subtitles fail to load:** Check the message in the popup. Some subtitle formats and image subtitles are unsupported; try another track.
- **You need to share a diagnostic recording:** Expand the connection and subtitle diagnostics section, start recording, reproduce the issue, then stop and download the recording. Download it before refreshing the page to avoid losing it.

Language and style settings are stored locally. Diagnostic recording must be started manually; you decide whether to download and share the resulting file.
