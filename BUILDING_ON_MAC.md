# How to Build Passport Renderer for Mac (.dmg Installer)

This guide is for building the Passport Renderer Electron app as a macOS installer (.dmg). You must use a Mac to complete these steps.

---

## Prerequisites

- **macOS computer**
- **Node.js** (v18 or newer recommended)
- **npm** (comes with Node.js)
- **Xcode Command Line Tools**
  - Install via Terminal: `xcode-select --install`
- **Apple Developer Account** (optional, for code signing/notarization)

---

## Steps

1. **Clone or Copy the Project**
   - Download or clone the `passport-renderer` project folder to your Mac.

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**
   - Ensure there is a `.env` file in the project root.
   - For production lockdown, set:
     ```
     LOCKDOWN_MODE=true
     ```
   - (Other variables like `VITE_SUPABASE_URL` and `VITE_API_BASE_URL` should also be present.)

4. **Build the Frontend**
   ```bash
   npm run build
   ```

5. **Build the macOS Installer**
   ```bash
   npm run dist
   ```
   - This will generate a `.dmg` installer in the `dist/` directory.

6. **(Optional) Code Signing and Notarization**
   - For public distribution, sign and notarize the app with an Apple Developer account.
   - For internal/testing use, unsigned apps can be opened by right-clicking and choosing "Open."

7. **Send the Installer**
   - The `.dmg` file in the `dist/` folder is ready to share.

---

## Troubleshooting
- If you see errors about missing native modules, make sure Xcode Command Line Tools are installed.
- If you need to build a non-lockdown (testing) version, set `LOCKDOWN_MODE=false` in the `.env` file before building.

---

**Contact the project maintainer if you have any issues or questions.**
