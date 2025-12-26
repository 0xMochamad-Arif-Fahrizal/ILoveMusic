# ILoveMusic 🎵

Aplikasi desktop untuk download dan manage musik dari SoundCloud, dibuat dengan Electron dan React.

## ✨ Features

- Download musik dari SoundCloud
- Extract metadata (BPM, Key) dari track
- Download single atau multiple tracks (dengan ZIP compression)
- Beautiful UI dengan React
- Cross-platform (macOS, Windows, Linux)

## 🚀 Installation

### Prerequisites

- Node.js (v16 atau lebih baru)
- npm atau yarn

### Setup

```bash
# Clone repository
git clone https://github.com/0xMochamad-Arif-Fahrizal/ILoveMusic.git
cd ILoveMusic

# Install dependencies
npm install
npm install --prefix renderer
```

## 🛠️ Development

```bash
# Run in development mode
npm run dev
```

## 📦 Build

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

Build output akan ada di folder `dist/`

## 📋 Requirements

Untuk BPM detection (opsional):
- `ffmpeg` - untuk audio conversion
- `aubio` - untuk BPM detection

Install dengan:
```bash
# macOS (Homebrew)
brew install ffmpeg aubio

# Windows/Linux
# Install sesuai package manager masing-masing
```

## 🎨 Tech Stack

- **Electron** - Desktop app framework
- **React** - UI framework
- **Vite** - Build tool
- **yt-dlp** - Downloader (bundled)
- **archiver** - ZIP compression
- **music-metadata** - Metadata extraction

## 📝 License

Private project

## 👤 Author

**RIPO**

Made with ❤️ by RIPO

---

## 🔗 Links

- Repository: https://github.com/0xMochamad-Arif-Fahrizal/ILoveMusic

