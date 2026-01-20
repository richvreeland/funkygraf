# 📉 funkygraf

Plot functions on a graph using a Javascript scratchpad. Useful for game/audio dev. Quickly test out easing curves, DSP, math functions, etc.

## Tips
- Use `x` as input (range varies by selection)
- Return a value in the selected y range, or an array: `return [y1, y2, y3];`
- Add labels: `return [a, b]; // labels(First) auto-fills missing as "b"`
- Hover over graph to see values at cursor position
- Create sliders: `const name = 5; // range(1,10)`
- Log scale sliders: `const freq = 1.0; // range(0.1,10.0,log)`
- `Tab`/`Shift+Tab` to indent/unindent • `Cmd+/` or `Ctrl+/` to toggle comments
