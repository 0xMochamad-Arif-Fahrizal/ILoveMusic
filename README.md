# ILoveMusic

Desktop application for downloading and managing music from SoundCloud, built with Electron and React.

## Features

- Download music from SoundCloud
- Extract metadata (BPM, Key) from tracks
- Download single or multiple tracks (with ZIP compression)
- Beautiful UI with React
- Cross-platform (macOS, Windows, Linux)

## Installation

### Prerequisites

- Node.js (v16 or newer)
- npm or yarn

### Setup

```bash
# Clone repository
git clone https://github.com/0xMochamad-Arif-Fahrizal/ILoveMusic.git
cd ILoveMusic

# Install dependencies
npm install
npm install --prefix renderer
```

## Development

```bash
# Run in development mode
npm run dev
```

## Build

### macOS
```bash
npm run build:mac
```

### Windows
```bash
npm run build:win
```

### Linux
```bash
npm run build:linux
```

Build output will be in the `dist/` folder.

## Requirements

For BPM detection (optional):
- `ffmpeg` - for audio conversion
- `aubio` - for BPM detection

Install with:
```bash
# macOS (Homebrew)
brew install ffmpeg aubio

# Windows/Linux
# Install according to your package manager
```

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI framework
- **Vite** - Build tool
- **yt-dlp** - Downloader (bundled)
- **archiver** - ZIP compression
- **music-metadata** - Metadata extraction

## License

Private project

## Author

**RIPO**

Made by RIPO

---

## Links

- Repository: https://github.com/0xMochamad-Arif-Fahrizal/ILoveMusic

