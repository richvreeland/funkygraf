import React, { useState, useEffect, useRef } from 'react';

const FunkyGraf = () => {
  const [funcCode, setFuncCode] = useState('const curve = 2.0; // range(0.1,5.0)\n\nreturn Math.pow(x, curve);');
  const [error, setError] = useState('');
  const [variables, setVariables] = useState({});
  const [labels, setLabels] = useState([]);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const [range, setRange] = useState('norm'); // 'norm', 'bipolar', 'trig'
  const canvasRef = useRef(null);
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  
  // Range configurations
  const rangeConfigs = {
    'norm': { xMin: 0, xMax: 1, yMin: 0, yMax: 1, label: 'norm', fullLabel: 'x:[0,1] y:[0,1]' },
    'bipolar': { xMin: 0, xMax: 1, yMin: -1, yMax: 1, label: 'bipolar y', fullLabel: 'x:[0,1] y:[-1,1]' },
    'trig': { xMin: 0, xMax: Math.PI * 2, yMin: -1, yMax: 1, label: 'trig', fullLabel: 'x:[0,2π] y:[-1,1]' }
  };
  
  const defaultFunctions = [
    { name: 'Linear', code: 'return x;', range: 'norm' },
    { name: 'Power', code: 'const curve = 2.0; // range(0.1,5.0)\n\nreturn Math.pow(x, curve);', range: 'norm' },
    { name: 'Multi-Curve', code: 'const phase = 0.0; // range(0.0,1.0)\nconst linear = x;\nconst square = Math.pow(x, 2);\nconst cubic = Math.pow(x, 3);\nconst sine = 0.5 + 0.5 * Math.sin((x + phase) * Math.PI * 2);\n\nreturn [linear, square, cubic, sine]; // labels(Linear)', range: 'norm' },
    { name: 'Sine', code: 'return Math.sin(x);', range: 'trig' },
    { name: 'Bipolar', code: 'return x * 2 - 1;', range: 'bipolar' },
    { name: 'Steps', code: 'const steps = 8; // range(2,16)\n\nreturn Math.floor(x * steps) / steps;', range: 'norm' },
    { name: 'S-Curve', code: 'const bend = 0.5; // range(-1.0,1.0)\n\nif (Math.abs(bend) < 0.01) {\n  return x;\n}\n\nconst power = 1 + Math.abs(bend) * 4;\nconst isFirstHalf = x < 0.5;\nconst t = isFirstHalf ? x * 2 : (x - 0.5) * 2;\n\n// Positive bend: ease-in then ease-out. Negative: ease-out then ease-in\nconst useEaseIn = (bend > 0) === isFirstHalf;\nconst eased = useEaseIn ? Math.pow(t, power) : 1 - Math.pow(1 - t, power);\n\nreturn isFirstHalf ? 0.5 * eased : 0.5 + 0.5 * eased;', range: 'norm' },
    { name: 'Bounce', code: 'const bounces = 3; // range(1,8)\n\nreturn Math.abs(Math.sin(x * Math.PI * bounces));', range: 'norm' }
  ];

  useEffect(() => {
    parseVariables();
    parseLabels();
  }, [funcCode]);

  useEffect(() => {
    drawGraph();
  }, [funcCode, variables, labels, cursorPos, hovering, range]);

  const highlightCode = () => {
    if (highlightRef.current && window.hljs) {
      const highlighted = window.hljs.highlight(funcCode, { language: 'javascript' }).value;
      highlightRef.current.innerHTML = highlighted;
    }
  };

  useEffect(() => {
    // Load highlight.js
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
    script.onload = () => {
      // Highlight code immediately after library loads
      highlightCode();
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
      document.head.removeChild(link);
    };
  }, []);

  useEffect(() => {
    highlightCode();
  }, [funcCode]);

  useEffect(() => {
    // Make canvas high DPI
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      
      drawGraph();
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (!textarea || !highlight) return;

    const syncSize = () => {
      highlight.style.height = `${textarea.offsetHeight}px`;
    };

    const resizeObserver = new ResizeObserver(syncSize);
    syncSize();
    resizeObserver.observe(textarea);

    return () => resizeObserver.disconnect();
  }, []);

  const handleScroll = (e) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.target.scrollTop;
      highlightRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const parseVariables = () => {
    const varRegex = /const\s+(\w+)\s*=\s*([^;]+);\s*\/\/\s*(range\([^)]+\)|checkbox)/g;
    const parsed = {};
    let match;
    
    while ((match = varRegex.exec(funcCode)) !== null) {
      const [, name, defaultValue, annotation] = match;
      
      if (annotation === 'checkbox') {
        parsed[name] = {
          type: 'checkbox',
          value: variables[name]?.value ?? (defaultValue.trim() === 'true'),
          default: defaultValue.trim() === 'true'
        };
      } else if (annotation.startsWith('range(')) {
        const rangeMatch = annotation.match(/range\(([^,]+),([^,)]+)(?:,\s*(\w+))?\)/);
        if (rangeMatch) {
          const minStr = rangeMatch[1].trim();
          const maxStr = rangeMatch[2].trim();
          const min = parseFloat(minStr);
          const max = parseFloat(maxStr);
          const scale = rangeMatch[3]?.trim() || 'linear';
          // Only treat as int if range is >= 3 and no decimal points
          const hasDecimal = minStr.includes('.') || maxStr.includes('.');
          const isInt = !hasDecimal && Number.isInteger(min) && Number.isInteger(max) && (max - min) >= 3 && scale !== 'log';
          const def = parseFloat(defaultValue);
          
          parsed[name] = {
            type: 'range',
            min,
            max,
            isInt,
            scale,
            value: variables[name]?.value ?? def,
            default: def
          };
        }
      }
    }
    
    setVariables(parsed);
  };

  const parseLabels = () => {
    // Find the LAST return statement in the code (not returns inside helper functions)
    const returnMatches = [...funcCode.matchAll(/return\s+([\s\S]*?);\s*(?:\/\/(.*))?$/gm)];
    if (returnMatches.length === 0) {
      setLabels([]);
      return;
    }
    
    // Use the last return statement
    const lastReturn = returnMatches[returnMatches.length - 1];
    const returnContent = lastReturn[1].trim();
    const comment = lastReturn[2] || '';
    
    // Parse return values to extract variable names
    let returnValues = [];
    if (returnContent.startsWith('[') && returnContent.endsWith(']')) {
      // Array return - parse the contents
      const arrayContent = returnContent.slice(1, -1);
      returnValues = arrayContent.split(',').map(val => {
        const trimmed = val.trim();
        // Skip commented values
        if (trimmed.startsWith('//')) return null;
        
        // Extract simple variable name (first word/identifier)
        const match = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        return match ? match[1] : null;
      }).filter(v => v !== null);
    } else {
      // Single value return - try to extract variable name
      const match = returnContent.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      returnValues = match ? [match[1]] : ['output'];
    }
    
    // Check if there's a labels() annotation in the comment
    const labelMatch = comment.match(/labels\(([^)]+)\)/);
    let providedLabels = [];
    if (labelMatch) {
      const labelString = labelMatch[1];
      providedLabels = labelString.split(',').map(l => l.trim());
    }
    
    // Build final labels array: use provided labels first, then fill in with variable names
    const finalLabels = [];
    for (let i = 0; i < returnValues.length; i++) {
      if (i < providedLabels.length && providedLabels[i]) {
        finalLabels.push(providedLabels[i]);
      } else {
        finalLabels.push(returnValues[i] || `output${i + 1}`);
      }
    }
    
    setLabels(finalLabels);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      
      if (e.shiftKey) {
        // Shift+Tab - unindent
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = value.indexOf('\n', end);
        const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
        const selectedLines = value.substring(lineStart, actualLineEnd);
        
        const unindentedLines = selectedLines.split('\n').map(line => {
          if (line.startsWith('  ')) return line.substring(2);
          if (line.startsWith('\t')) return line.substring(1);
          return line;
        }).join('\n');
        
        const newValue = value.substring(0, lineStart) + unindentedLines + value.substring(actualLineEnd);
        setFuncCode(newValue);
        
        setTimeout(() => {
          textarea.selectionStart = start - 2 >= lineStart ? start - 2 : lineStart;
          textarea.selectionEnd = end - 2;
        }, 0);
      } else {
        // Tab - indent
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = value.indexOf('\n', end);
        const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
        const selectedLines = value.substring(lineStart, actualLineEnd);
        
        const indentedLines = selectedLines.split('\n').map(line => '  ' + line).join('\n');
        
        const newValue = value.substring(0, lineStart) + indentedLines + value.substring(actualLineEnd);
        setFuncCode(newValue);
        
        setTimeout(() => {
          textarea.selectionStart = start + 2;
          textarea.selectionEnd = end + 2 + (selectedLines.split('\n').length - 1) * 2;
        }, 0);
      }
    } else if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
      // Cmd+/ or Ctrl+/ - toggle comment
      e.preventDefault();
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = value.indexOf('\n', end);
      const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
      const selectedLines = value.substring(lineStart, actualLineEnd);
      
      const lines = selectedLines.split('\n');
      
      // Check if all selected lines are commented
      const allCommented = lines.every(line => line.trim().startsWith('//') || line.trim() === '');
      
      let newLines;
      if (allCommented) {
        // Uncomment all lines
        newLines = lines.map(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('//')) {
            // Remove // and one space if present
            const uncommented = trimmed.substring(2);
            const leadingSpace = line.match(/^(\s*)/)[1];
            return leadingSpace + (uncommented.startsWith(' ') ? uncommented.substring(1) : uncommented);
          }
          return line;
        }).join('\n');
      } else {
        // Comment all lines
        newLines = lines.map(line => {
          if (line.trim() === '') return line;
          const leadingSpace = line.match(/^(\s*)/)[1];
          return leadingSpace + '// ' + line.substring(leadingSpace.length);
        }).join('\n');
      }
      
      const newValue = value.substring(0, lineStart) + newLines + value.substring(actualLineEnd);
      setFuncCode(newValue);
      
      setTimeout(() => {
        textarea.selectionStart = start;
        textarea.selectionEnd = end + (newLines.length - selectedLines.length);
      }, 0);
    } else if (e.key === '{') {
      // Auto-close braces
      e.preventDefault();
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      
      const newValue = value.substring(0, start) + '{}' + value.substring(end);
      setFuncCode(newValue);
      
      setTimeout(() => {
        textarea.selectionStart = start + 1;
        textarea.selectionEnd = start + 1;
      }, 0);
    } else if (e.key === 'Enter') {
      // Auto-indent on Enter
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const value = textarea.value;
      
      // Find the current line
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLine = value.substring(lineStart, start);
      
      // Get the indentation of the current line
      const indentMatch = currentLine.match(/^(\s*)/);
      const currentIndent = indentMatch ? indentMatch[1] : '';
      
      // Check if the character before cursor is an opening brace
      const charBeforeCursor = value[start - 1];
      const charAfterCursor = value[start];
      
      if (charBeforeCursor === '{' && charAfterCursor === '}') {
        // We're between braces - add extra indent and position cursor
        e.preventDefault();
        const newIndent = currentIndent + '  ';
        const newValue = value.substring(0, start) + '\n' + newIndent + '\n' + currentIndent + value.substring(start);
        setFuncCode(newValue);
        
        setTimeout(() => {
          textarea.selectionStart = start + 1 + newIndent.length;
          textarea.selectionEnd = start + 1 + newIndent.length;
        }, 0);
      } else if (charBeforeCursor === '{') {
        // Opening brace - increase indent
        e.preventDefault();
        const newIndent = currentIndent + '  ';
        const newValue = value.substring(0, start) + '\n' + newIndent + value.substring(start);
        setFuncCode(newValue);
        
        setTimeout(() => {
          textarea.selectionStart = start + 1 + newIndent.length;
          textarea.selectionEnd = start + 1 + newIndent.length;
        }, 0);
      } else {
        // Normal enter - maintain current indent
        e.preventDefault();
        const newValue = value.substring(0, start) + '\n' + currentIndent + value.substring(start);
        setFuncCode(newValue);
        
        setTimeout(() => {
          textarea.selectionStart = start + 1 + currentIndent.length;
          textarea.selectionEnd = start + 1 + currentIndent.length;
        }, 0);
      }
    }
  };

  const updateVariable = (name, value) => {
    setVariables(prev => ({
      ...prev,
      [name]: { ...prev[name], value }
    }));
  };

  // Convert linear slider position (0-1) to log scale value
  const linearToLog = (linear, min, max) => {
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    return Math.exp(logMin + linear * (logMax - logMin));
  };

  // Convert log scale value to linear slider position (0-1)
  const logToLinear = (value, min, max) => {
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    return (Math.log(value) - logMin) / (logMax - logMin);
  };

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const padding = 40;
    const graphWidth = rect.width - 2 * padding;
    
    // Get raw mouse position
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    
    // Clamp X position to stay within graph bounds (padding to width-padding)
    const clampedX = Math.max(padding, Math.min(rect.width - padding, rawX));
    
    setCursorPos({
      x: clampedX,
      y: rawY
    });
    setHovering(true);
  };

  const handleCanvasMouseLeave = () => {
    setHovering(false);
  };

  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const padding = 40;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;
    
    const config = rangeConfigs[range];
    const { xMin, xMax, yMin, yMax } = config;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    
    const xDivisions = range === 'trig' ? 8 : 10;
    const yDivisions = 10;
    
    // Vertical grid lines
    for (let i = 0; i <= xDivisions; i++) {
      const x = padding + (i / xDivisions) * graphWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let i = 0; i <= yDivisions; i++) {
      const y = padding + (i / yDivisions) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
    
    // Draw zero line for bipolar ranges
    if (yMin < 0) {
      const zeroY = height - padding - ((0 - yMin) / (yMax - yMin)) * graphHeight;
      ctx.strokeStyle = '#4a4a4a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding, zeroY);
      ctx.lineTo(width - padding, zeroY);
      ctx.stroke();
    }
    
    // Draw axes
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    
    // X-axis (at bottom)
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.stroke();
    
    // Draw labels
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    
    // X-axis labels
    for (let i = 0; i <= xDivisions; i++) {
      const x = padding + (i / xDivisions) * graphWidth;
      const value = xMin + (i / xDivisions) * (xMax - xMin);
      let label;
      if (range === 'trig') {
        // Show as fractions of π
        const piValue = value / Math.PI;
        if (piValue === 0) label = '0';
        else if (piValue === 2) label = '2π';
        else label = piValue.toFixed(2) + 'π';
      } else {
        label = value.toFixed(1);
      }
      ctx.fillText(label, x, height - padding + 20);
    }
    
    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= yDivisions; i++) {
      const y = height - padding - (i / yDivisions) * graphHeight;
      const value = yMin + (i / yDivisions) * (yMax - yMin);
      const label = value.toFixed(1);
      ctx.fillText(label, padding - 10, y + 4);
    }
    
    // Axis titles
    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Input (x)', width / 2, height - 5);
    
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Output (y)', 0, 0);
    ctx.restore();
    
    // Evaluate and draw function
    try {
      // Strip original variable declarations with range/checkbox annotations
      const cleanedCode = funcCode.replace(/const\s+\w+\s*=\s*[^;]+;\s*\/\/\s*(range\([^)]+\)|checkbox)[^\n]*\n?/g, '');
      
      // Build variable declarations from current values
      const variableDeclarations = Object.entries(variables)
        .map(([name, config]) => `const ${name} = ${config.value};`)
        .join('\n') + '\n\n';
      
      const fullCode = variableDeclarations + cleanedCode;
      const func = new Function('x', fullCode);
      
      // Colors for multiple outputs
      const colors = ['#00ff88', '#ff4444', '#ffdd44', '#4488ff'];
      
      const samples = 500;
      
      // Collect all function outputs first to determine how many curves we have
      const outputs = [];
      for (let i = 0; i <= samples; i++) {
        const t = i / samples; // 0 to 1
        const x = xMin + t * (xMax - xMin); // Map to actual x range
        const result = func(x);
        outputs.push(Array.isArray(result) ? result : [result]);
      }
      
      // Determine number of curves
      const numCurves = Math.max(...outputs.map(o => o.length));
      
      // Draw each curve
      for (let curveIndex = 0; curveIndex < numCurves; curveIndex++) {
        ctx.strokeStyle = colors[curveIndex % colors.length];
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        
        let started = false;
        
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          let y = outputs[i][curveIndex];
          
          if (y === undefined) continue;
          
          // Map to canvas coordinates (no clamping - let it go beyond edges)
          const canvasX = padding + t * graphWidth;
          const canvasY = height - padding - ((y - yMin) / (yMax - yMin)) * graphHeight;
          
          if (!started) {
            ctx.moveTo(canvasX, canvasY);
            started = true;
          } else {
            ctx.lineTo(canvasX, canvasY);
          }
        }
        
        ctx.stroke();
        
        // Draw start/end points
        ctx.fillStyle = colors[curveIndex % colors.length];
        const startY = Math.max(yMin, Math.min(yMax, outputs[0][curveIndex] || 0));
        const endY = Math.max(yMin, Math.min(yMax, outputs[samples][curveIndex] || 0));
        
        if (outputs[0][curveIndex] !== undefined) {
          ctx.beginPath();
          const startCanvasY = height - padding - ((startY - yMin) / (yMax - yMin)) * graphHeight;
          ctx.arc(padding, startCanvasY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        
        if (outputs[samples][curveIndex] !== undefined) {
          ctx.beginPath();
          const endCanvasY = height - padding - ((endY - yMin) / (yMax - yMin)) * graphHeight;
          ctx.arc(width - padding, endCanvasY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Draw cursor line and labels if hovering
      if (hovering && cursorPos.x >= padding && cursorPos.x <= width - padding) {
        // Vertical cursor line
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(cursorPos.x, padding);
        ctx.lineTo(cursorPos.x, height - padding);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Calculate x value from cursor position (0 to 1 normalized)
        const t = (cursorPos.x - padding) / graphWidth;
        const xValue = xMin + t * (xMax - xMin); // Actual x value in range
        
        // Draw labels and values at cursor position
        if (labels.length > 0) {
          ctx.font = '13px monospace';
          
          for (let i = 0; i < numCurves; i++) {
            if (labels[i]) {
              // Get y value at this x position
              const sampleIndex = Math.round(t * samples);
              const yValue = outputs[sampleIndex][i];
              
              if (yValue !== undefined) {
                const clampedY = Math.max(yMin, Math.min(yMax, yValue));
                
                // Draw dot at cursor position on curve
                ctx.fillStyle = colors[i % colors.length];
                const dotY = height - padding - ((clampedY - yMin) / (yMax - yMin)) * graphHeight;
                ctx.beginPath();
                ctx.arc(cursorPos.x, dotY, 4, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw label with value next to the dot
                ctx.fillStyle = colors[i % colors.length];
                const labelText = `${labels[i]}: ${yValue.toFixed(3)}`;
                
                // Measure label width
                const metrics = ctx.measureText(labelText);
                const labelWidth = metrics.width + 4;
                
                // Determine if we're near the right edge (x > 0.85)
                const xNormalized = (cursorPos.x - padding) / graphWidth;
                const nearRightEdge = xNormalized > 0.85;
                
                // Position label to the right or left of the dot
                let labelX, textAlign;
                if (nearRightEdge) {
                  // Position to the left
                  labelX = cursorPos.x - labelWidth - 10;
                  textAlign = 'left';
                } else {
                  // Position to the right
                  labelX = cursorPos.x + 10;
                  textAlign = 'left';
                }
                const labelY = dotY + 4;
                
                // Draw background for label
                ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
                ctx.fillRect(labelX - 2, labelY - 12, labelWidth, 16);
                
                // Draw label text
                ctx.fillStyle = colors[i % colors.length];
                ctx.textAlign = textAlign;
                ctx.fillText(labelText, labelX, labelY);
              }
            }
          }
        }
      }
      
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-950 text-gray-300 font-mono flex flex-col items-center p-4">
      <div className="w-full max-w-7xl">
        {/* Header with title and range selector */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl text-emerald-400 font-normal">
            funkygraf
          </h1>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Range:</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="bg-gray-800 text-gray-300 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-400"
            >
              {Object.entries(rangeConfigs).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Main content area - responsive layout */}
        <div className="flex flex-col gap-4 mb-4">
          {/* Top row - Graph and Parameters */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Left side - Graph */}
            <div 
              className="flex-1 min-w-0"
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={handleCanvasMouseLeave}
            >
              <canvas
                ref={canvasRef}
                className="border border-gray-700 rounded w-full cursor-crosshair"
                style={{ height: '600px', display: 'block' }}
              />
            </div>
            
            {/* Right side - Parameters */}
            <div className="w-full md:w-96 md:flex-shrink-0">
              <div className="bg-gray-900 border border-gray-700 rounded p-4">
                <div className="text-xs text-gray-400 mb-3">
                  Parameters: {Object.keys(variables).length === 0 ? 'none' : ''}
                </div>
                {Object.keys(variables).length > 0 && (
                  <div className="space-y-3">
                    {Object.entries(variables).map(([name, config]) => (
                      <div key={name} className="flex items-center gap-3">
                        <label className="text-xs text-gray-300 w-20 flex-shrink-0">{name}:</label>
                        {config.type === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={config.value}
                            onChange={(e) => updateVariable(name, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-400 focus:ring-emerald-400 focus:ring-2"
                          />
                        ) : (
                          <div className="flex-1 flex items-center gap-3">
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={config.scale === 'log' ? 0.001 : (config.isInt ? 1 / (config.max - config.min) : 0.001)}
                              value={config.scale === 'log' ? logToLinear(config.value, config.min, config.max) : (config.value - config.min) / (config.max - config.min)}
                              onChange={(e) => {
                                const linear = parseFloat(e.target.value);
                                if (config.scale === 'log') {
                                  updateVariable(name, linearToLog(linear, config.min, config.max));
                                } else {
                                  const rawValue = config.min + linear * (config.max - config.min);
                                  updateVariable(name, config.isInt ? Math.round(rawValue) : rawValue);
                                }
                              }}
                              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                            />
                            <span className="text-emerald-400 text-xs font-mono w-12 text-right">
                              {config.isInt ? config.value : config.value.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Bottom row - Code Editor */}
          <div>
              <label className="block mb-2 text-xs text-gray-400">
                Function ({rangeConfigs[range].fullLabel}):
              </label>
              <style>{`
                .code-textarea::-webkit-scrollbar {
                  width: 12px;
                }
                .code-textarea::-webkit-scrollbar-track {
                  background: #1f2937;
                  border-radius: 4px;
                }
                .code-textarea::-webkit-scrollbar-thumb {
                  background: #4b5563;
                  border-radius: 4px;
                  border: 2px solid #1f2937;
                }
                .code-textarea::-webkit-scrollbar-thumb:hover {
                  background: #6b7280;
                }
                .code-textarea {
                  scrollbar-width: thin;
                  scrollbar-color: #4b5563 #1f2937;
                }
                .highlight-overlay::-webkit-scrollbar {
                  display: none;
                }
                .highlight-overlay {
                  scrollbar-width: none;
                }
              `}</style>
              <div className="relative rounded border border-gray-700 focus-within:border-emerald-400" style={{ backgroundColor: '#111827' }}>
                <pre
                  ref={highlightRef}
                  className="absolute top-0 left-0 m-0 p-0 pointer-events-none overflow-auto highlight-overlay rounded"
                  style={{
                    width: '100%',
                    height: '400px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    fontFamily: 'monospace',
                    tabSize: 2,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    boxSizing: 'border-box',
                    background: 'transparent'
                  }}
                ></pre>
                <textarea
                  ref={textareaRef}
                  value={funcCode}
                  onChange={(e) => setFuncCode(e.target.value)}
                  onScroll={handleScroll}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  className="relative w-full bg-transparent text-transparent border-none rounded resize-y focus:outline-none code-textarea z-10 m-0 p-0 block"
                  style={{
                    height: '400px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    fontFamily: 'monospace',
                    tabSize: 2,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    boxSizing: 'border-box',
                    caretColor: '#ffffff'
                  }}
                />
              </div>
            </div>
          
          {/* Bottom section - Presets and Tips */}
        <div className="flex flex-col gap-4">
          {error && (
            <div className="bg-red-950/50 border border-red-900 rounded p-3 text-xs text-red-400">
              Error: {error}
            </div>
          )}
          
          <div>
            <div className="mb-2 text-xs text-gray-400">
              Presets:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
              {defaultFunctions.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => {
                    setFuncCode(preset.code);
                    if (preset.range) setRange(preset.range);
                  }}
                  className="bg-gray-900 text-gray-300 border border-gray-700 rounded px-3 py-2 text-xs cursor-pointer transition-all hover:bg-gray-800 hover:border-emerald-400"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="bg-gray-900 border border-gray-700 rounded p-3 text-xs text-gray-500 leading-relaxed">
            <div className="mb-2 text-gray-400">Tips:</div>
            • Use <code className="text-emerald-400">x</code> as input (range varies by selection)<br/>
            • Return a value in the selected y range, or an array: <code className="text-emerald-400">return [y1, y2, y3]</code><br/>
            • Add labels: <code className="text-emerald-400">return [a, b]; // labels(First)</code> auto-fills missing as "b"<br/>
            • Hover over graph to see values at cursor position<br/>
            • Create sliders: <code className="text-emerald-400">const name = 5; // range(1,10)</code><br/>
            • Log scale sliders: <code className="text-emerald-400">const freq = 1.0; // range(0.1,10.0,log)</code><br/>
            • Tab/Shift+Tab to indent/unindent • Cmd+/ or Ctrl+/ to toggle comments
          </div>
          </div>
        </div>
        
        {/* Version */}
        <div className="w-full text-center mt-8 text-xs text-gray-600">
          v0.26
        </div>
      </div>
    </div>
  );
};

export default FunkyGraf;
