# Performance Analysis - Lag Investigation

## Potential Lag Sources

### 1. **Image Size & Quality** (HIGH IMPACT)
- Current: `quality: 85`, `maxWidth: 1920`, `maxHeight: 1080`
- **Impact**: Large images = more data to transfer = more lag
- **Solution**: Lower quality (60-70) and/or resolution (1280x720)

### 2. **Frame Rate** (HIGH IMPACT)
- Current: `everyNthFrame: 1` (sends every frame)
- **Impact**: Too many frames = network congestion
- **Solution**: Skip frames (`everyNthFrame: 2` or `3`)

### 3. **Base64 Conversion on Client** (MEDIUM IMPACT)
- Current: Converting binary → base64 on client side
- **Impact**: CPU-intensive operation blocks rendering
- **Solution**: Use Blob URLs or ImageBitmap API

### 4. **No Frame Throttling** (MEDIUM IMPACT)
- Current: No rate limiting on server
- **Impact**: Can overwhelm network/client
- **Solution**: Add frame throttling (max 20-30 FPS)

### 5. **Network Latency** (VARIABLE)
- EC2 server → Client network distance
- **Impact**: Physical distance adds latency
- **Solution**: Use CDN or closer server region

### 6. **Image Decoding** (LOW-MEDIUM IMPACT)
- Browser decoding JPEG images
- **Impact**: Takes CPU time
- **Solution**: Use WebP format (smaller, faster decode)

## Recommended Optimizations (in order of impact)

1. **Lower resolution**: 1280x720 instead of 1920x1080
2. **Lower quality**: 60-70 instead of 85
3. **Skip frames**: everyNthFrame: 2 (30 FPS max)
4. **Frame throttling**: Max 20-30 FPS on server
5. **Use Blob URLs**: Avoid base64 conversion overhead

## Testing Commands

```bash
# Check network latency
ping your-ec2-ip

# Monitor server CPU/Memory
pm2 monit

# Check frame rate in browser console
# Add timing logs to see actual FPS
```
