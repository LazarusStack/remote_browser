# Cursor Calibration Tool

A visual tool to test and calibrate cursor offset settings for the remote browser.

## Features

- **Visual Box**: A clear calibration box (400×400px) to test cursor accuracy
- **Real-time Status**: Shows if cursor is inside or outside the box
- **Position Tracking**: Displays exact mouse coordinates
- **Click Testing**: Shows where clicks register and if they're inside/outside
- **Distance Display**: Shows distance from box when outside
- **Color Indicators**: 
  - 🟢 Green = Inside box
  - 🔴 Red = Outside box

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will run on `http://localhost:5175`

## Usage

1. Open this tool in the remote browser
2. Move your cursor around the calibration box
3. Watch the indicator change color:
   - **Green** when inside the box
   - **Red** when outside the box
4. Click to test if clicks register correctly
5. Use the offset configuration tool to adjust offsets until clicks register accurately

## How It Works

- The box is positioned at coordinates (100, 100) with size 400×400px
- The tool tracks your cursor position in real-time
- It calculates if the cursor is inside the box boundaries
- Click events show exactly where they register
- Use this to verify your offset settings are correct

## Testing Workflow

1. Open cursor calibration tool in remote browser
2. Open offset configuration tool in a separate window
3. Move cursor to box edges and corners
4. Adjust offsets until:
   - Cursor indicator turns green when inside box
   - Clicks register inside the box when you click inside
   - Cursor indicator turns red when outside box
