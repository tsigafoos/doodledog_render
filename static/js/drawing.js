document.addEventListener('DOMContentLoaded', () => {
    const drawingCanvas = document.getElementById('drawingCanvas');
    const previewCanvas = document.getElementById('previewCanvas');
    const canvasWrapper = document.getElementById('canvasWrapper');
    const ctx = drawingCanvas.getContext('2d', { willReadFrequently: true });
    const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
    console.log('Canvas context initialized:', { ctx: !!ctx, previewCtx: !!previewCtx, willReadFrequently: ctx.willReadFrequently });
    const colorPicker = document.getElementById('colorPicker');
    const fillColorPicker = document.getElementById('fillColorPicker');
    const strokeWidth = document.getElementById('strokeWidth');
    const strokeWidthValue = document.getElementById('strokeWidthValue');
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomValue = document.getElementById('zoomValue');
    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    const undoButton = document.getElementById('undoButton');
    const saveButton = document.getElementById('saveButton');
    const canvasWidthInput = document.getElementById('canvasWidthInput');
    const canvasHeightInput = document.getElementById('canvasHeightInput');
    const updateCanvasSizeButton = document.getElementById('updateCanvasSizeButton');
    const toolButtons = document.querySelectorAll('.tool-btn');
    const cropModal = document.getElementById('cropModal');
    const confirmCrop = document.getElementById('confirmCrop');
    const cancelCrop = document.getElementById('cancelCrop');

    let currentTool = 'brush';
    let isDrawing = false;
    let startX, startY;
    let scale = 1;
    let polygonPoints = [];
    let undoStack = [];
    let maxUndoSteps = 20;
    let grabStartX, grabStartY, grabStartScrollLeft, grabStartScrollTop;
    let pendingCrop = null;

    // Save canvas state for undo
    function saveCanvasState() {
        undoStack.push(ctx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height));
        if (undoStack.length > maxUndoSteps) {
            undoStack.shift();
        }
        console.log('Canvas state saved:', undoStack.length);
    }

    // Undo last action
    function undo() {
        if (undoStack.length > 0) {
            ctx.putImageData(undoStack.pop(), 0, 0);
            console.log('Undo applied:', undoStack.length);
        }
    }

    // Set canvas size with fixed white background
    function resizeCanvas(newWidth = null, newHeight = null) {
        const style = window.getComputedStyle(canvasWrapper);
        const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const targetWidth = newWidth || 800;
        const targetHeight = newHeight || 600;
        //const targetWidth = newWidth || Math.max(canvasWrapper.clientWidth - paddingX, 800);
        //const targetHeight = newHeight || Math.max(canvasWrapper.clientHeight - paddingY, 800);
        
        // Preserve existing content
        let imageData = null;
        if (drawingCanvas.width > 0 && drawingCanvas.height > 0) {
            imageData = ctx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
        }
        
        drawingCanvas.width = targetWidth;
        drawingCanvas.height = targetHeight;
        previewCanvas.width = targetWidth;
        previewCanvas.height = targetHeight;
        
        // Set CSS dimensions
        drawingCanvas.style.width = `${targetWidth}px`;
        drawingCanvas.style.height = `${targetHeight}px`;
        previewCanvas.style.width = `${targetWidth}px`;
        previewCanvas.style.height = `${targetHeight}px`;
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        if (imageData) {
            ctx.putImageData(imageData, 0, 0);
        }
        
        canvasWidthInput.value = drawingCanvas.width;
        canvasHeightInput.value = drawingCanvas.height;
        
        clearPreview();
        if (undoStack.length > 0) {
            ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
        }
        saveCanvasState();
        
        canvasWrapper.style.width = `${drawingCanvas.width * scale}px`;
        canvasWrapper.style.height = `${drawingCanvas.height * scale}px`;
        
        console.log('Resized canvas:', {
            targetWidth, targetHeight,
            drawingCanvas: { width: drawingCanvas.width, height: drawingCanvas.height, styleWidth: drawingCanvas.style.width },
            previewCanvas: { width: previewCanvas.width, height: previewCanvas.height, styleWidth: previewCanvas.style.width }
        });
    }
    // Initialize canvas
    resizeCanvas();
    window.addEventListener('resize', () => resizeCanvas());

    // Crop canvas
    function cropCanvas(x1, y1, x2, y2) {
        console.log('Crop coords:', { x1, y1, x2, y2 });
        const left = Math.max(0, Math.min(x1, x2));
        const top = Math.max(0, Math.min(y1, y2));
        const right = Math.min(drawingCanvas.width, Math.max(x1, x2));
        const bottom = Math.min(drawingCanvas.height, Math.max(y1, y2));
        const cropWidth = Math.max(1, right - left);
        const cropHeight = Math.max(1, bottom - top);
        console.log('Crop dimensions:', { left, top, right, bottom, cropWidth, cropHeight });

        if (cropWidth <= 0 || cropHeight <= 0) {
            console.error('Invalid crop dimensions:', { cropWidth, cropHeight });
            return;
        }

        const croppedData = ctx.getImageData(left, top, cropWidth, cropHeight);
        drawingCanvas.width = cropWidth;
        drawingCanvas.height = cropHeight;
        previewCanvas.width = cropWidth;
        previewCanvas.height = cropHeight;

        drawingCanvas.style.width = `${cropWidth}px`;
        drawingCanvas.style.height = `${cropHeight}px`;
        previewCanvas.style.width = `${cropWidth}px`;
        previewCanvas.style.height = `${cropHeight}px`;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cropWidth, cropHeight);
        ctx.putImageData(croppedData, 0, 0);

        canvasWidthInput.value = cropWidth;
        canvasHeightInput.value = cropHeight;

        canvasWrapper.style.width = `${cropWidth * scale}px`;
        canvasWrapper.style.height = `${cropHeight * scale}px`;

        requestAnimationFrame(() => {
            canvasWrapper.style.transform = `scale(${scale})`;
            console.log('Canvas redrawn:', drawingCanvas.width, 'x', drawingCanvas.height);
        });

        console.log('Cropped canvas:', { cropWidth, cropHeight });
    }

    // Save canvas as PNG
    saveButton.addEventListener('click', () => {
        console.log('Saving canvas');
        const dataURL = drawingCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = 'drawing.png';
        link.click();
    });

    // Update canvas size from inputs
    updateCanvasSizeButton.addEventListener('click', () => {
        let newWidth = parseInt(canvasWidthInput.value);
        let newHeight = parseInt(canvasHeightInput.value);
        newWidth = Math.max(100, Math.min(5000, isNaN(newWidth) ? drawingCanvas.width : newWidth));
        newHeight = Math.max(100, Math.min(5000, isNaN(newHeight) ? drawingCanvas.height : newHeight));
        console.log('Update size:', newWidth, 'x', newHeight);
        resizeCanvas(newWidth, newHeight);
    });

    // Tool selection
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentTool = button.dataset.tool;
            toolButtons.forEach(btn => btn.classList.remove('bg-gray-500'));
            button.classList.add('bg-gray-500');
            updateCursor();
            if (currentTool !== 'polygon') {
                polygonPoints = [];
            }
            console.log('Tool selected:', currentTool);
        });
    });

    // Update cursor
    function updateCursor() {
        drawingCanvas.style.cursor = currentTool === 'brush' || currentTool === 'eraser' || currentTool === 'polygon' ? 'crosshair' :
                                    ['rectangle', 'filled_rectangle', 'circle', 'filled_circle', 'crop'].includes(currentTool) ? 'default' :
                                    currentTool === 'grab' ? 'move' : 'default';
        console.log('Cursor updated:', drawingCanvas.style.cursor);
    }
    updateCursor();

    // Clear preview canvas
    function clearPreview() {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }

    // Draw hover cursor
    function drawHoverCursor(x, y) {
        if (currentTool === 'grab') return;
        clearPreview();
        previewCtx.strokeStyle = 'black';
        previewCtx.lineWidth = 1;
        previewCtx.setLineDash([]);

        switch (currentTool) {
            case 'brush':
            case 'eraser':
            case 'polygon':
                previewCtx.beginPath();
                previewCtx.moveTo(x - 5, y);
                previewCtx.lineTo(x + 5, y);
                previewCtx.moveTo(x, y - 5);
                previewCtx.lineTo(x, y + 5);
                previewCtx.stroke();
                break;
            case 'rectangle':
            case 'filled_rectangle':
            case 'crop':
                previewCtx.beginPath();
                previewCtx.strokeRect(x - 3, y - 3, 6, 6);
                previewCtx.stroke();
                break;
            case 'circle':
            case 'filled_circle':
                previewCtx.beginPath();
                previewCtx.arc(x, y, 3, 0, Math.PI * 2);
                previewCtx.stroke();
                break;
        }
    }

    // Update stroke width
    strokeWidth.addEventListener('input', () => {
        strokeWidthValue.textContent = strokeWidth.value;
        console.log('Stroke width:', strokeWidth.value);
    });

    // Zoom controls
    const updateZoom = (newScale) => {
        scale = Math.max(0.5, Math.min(2, newScale));
        zoomSlider.value = scale;
        zoomValue.textContent = `${Math.round(scale * 100)}%`;
        canvasWrapper.style.transform = `scale(${scale})`;
        canvasWrapper.style.transformOrigin = 'top left';
        canvasWrapper.style.width = `${drawingCanvas.width * scale}px`;
        canvasWrapper.style.height = `${drawingCanvas.height * scale}px`;
        console.log('Zoom updated:', scale);
    };

    zoomSlider.addEventListener('input', () => updateZoom(parseFloat(zoomSlider.value)));
    zoomIn.addEventListener('click', () => updateZoom(scale + 0.1));
    zoomOut.addEventListener('click', () => updateZoom(scale - 0.1));

    // Undo button
    undoButton.addEventListener('click', undo);

    // Canvas coordinates
    const getCanvasCoords = (e) => {
        const canvasRect = drawingCanvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const x = (clientX - canvasRect.left + canvasWrapper.scrollLeft * scale) / scale;
        const y = (clientY - canvasRect.top + canvasWrapper.scrollTop * scale) / scale;
        return { x: Math.floor(x), y: Math.floor(y) };
    };

    // Hex to RGBA
    function hexToRGBA(hex) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return [r, g, b, 255];
    }

    // Compare colors
    function colorsMatch(a, b) {
        return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
    }

    // Flood-fill
    function floodFill(x, y, fillColor) {
        const imageData = ctx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
        const data = imageData.data;
        const targetColor = ctx.getImageData(x, y, 1, 1).data;
        if (colorsMatch(targetColor, fillColor)) return;

        const stack = [{ x, y }];
        const width = drawingCanvas.width;
        const height = drawingCanvas.height;

        while (stack.length) {
            const { x, y } = stack.pop();
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const idx = (y * width + x) * 4;
            const currentColor = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];

            if (!colorsMatch(currentColor, targetColor)) continue;

            data[idx] = fillColor[0];
            data[idx + 1] = fillColor[1];
            data[idx + 2] = fillColor[2];
            data[idx + 3] = fillColor[3];

            stack.push({ x: x + 1, y });
            stack.push({ x: x - 1, y });
            stack.push({ x, y: y + 1 });
            stack.push({ x, y: y - 1 });
        }

        ctx.putImageData(imageData, 0, 0);
        console.log('Flood fill applied at:', x, y);
    }

    const startDrawing = (e) => {
        try {
            e.preventDefault();
            const { x, y } = getCanvasCoords(e);
            isDrawing = true;
            startX = x;
            startY = y;

            if (currentTool === 'grab') {
                grabStartX = e.clientX || (e.touches && e.touches[0].clientX);
                grabStartY = e.clientY || (e.touches && e.touches[0].clientY);
                grabStartScrollLeft = canvasWrapper.scrollLeft;
                grabStartScrollTop = canvasWrapper.scrollTop;
                console.log('Grab start:', { grabStartX, grabStartY, scrollLeft: grabStartScrollLeft, scrollTop: grabStartScrollTop });
            } else if (currentTool === 'polygon') {
                polygonPoints.push({ x, y });
                drawPolygon();
            }
            clearPreview();
            console.log('Start drawing:', { tool: currentTool, x, y });
        } catch (err) {
            console.error('Error in startDrawing:', err);
        }
    };

    const draw = (e) => {
        try {
            e.preventDefault();
            const { x, y } = getCanvasCoords(e);

            if (!isDrawing) {
                drawHoverCursor(x, y);
                return;
            }

            if (currentTool === 'grab') {
                const clientX = e.clientX || (e.touches && e.touches[0].clientX);
                const clientY = e.clientY || (e.touches && e.touches[0].clientY);
                const deltaX = clientX - grabStartX;
                const deltaY = clientY - grabStartY;
                canvasWrapper.scrollLeft = grabStartScrollLeft - deltaX;
                canvasWrapper.scrollTop = grabStartScrollTop - deltaY;
                console.log('Grab move:', { deltaX, deltaY, scrollLeft: canvasWrapper.scrollLeft, scrollTop: canvasWrapper.scrollTop });
                return;
            }

            ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : colorPicker.value;
            ctx.lineWidth = strokeWidth.value;
            ctx.lineCap = 'round';

            console.log('Drawing:', { tool: currentTool, x, y, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth });

            if (currentTool === 'brush' || currentTool === 'eraser') {
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(x, y);
                ctx.stroke();
                startX = x;
                startY = y;
            } else if (['rectangle', 'filled_rectangle', 'circle', 'filled_circle', 'crop'].includes(currentTool)) {
                clearPreview();
                previewCtx.strokeStyle = 'black';
                previewCtx.lineWidth = 0.5;
                previewCtx.setLineDash([5, 5]);
                previewCtx.beginPath();
                if (currentTool === 'rectangle' || currentTool === 'filled_rectangle' || currentTool === 'crop') {
                    const scaledStartX = startX * scale;
                    const scaledStartY = startY * scale;
                    const scaledWidth = (x - startX) * scale;
                    const scaledHeight = (y - startY) * scale;
                    console.log('Preview rect:', { scaledStartX, scaledStartY, scaledWidth, scaledHeight });
                    previewCtx.strokeRect(scaledStartX, scaledStartY, scaledWidth, scaledHeight);
                } else {
                    const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
                    previewCtx.arc(startX * scale, startY * scale, radius * scale, 0, Math.PI * 2);
                }
                previewCtx.stroke();
                previewCtx.setLineDash([]);
            }
        } catch (err) {
            console.error('Error in draw:', err);
        }
    };

    const stopDrawing = (e) => {
        try {
            if (!isDrawing) return;
            e.preventDefault();
            isDrawing = false;
            const { x, y } = getCanvasCoords(e);

            if (currentTool === 'grab') {
                clearPreview();
                console.log('Grab end:', { scrollLeft: canvasWrapper.scrollLeft, scrollTop: canvasWrapper.scrollTop });
                return;
            }

            console.log('Stop drawing:', { tool: currentTool, x, y });

            if (currentTool !== 'crop') {
                saveCanvasState();
            }

            ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : colorPicker.value;
            ctx.fillStyle = fillColorPicker.value;
            ctx.lineWidth = strokeWidth.value;

            if (currentTool === 'rectangle' || currentTool === 'filled_rectangle') {
                ctx.beginPath();
                if (currentTool === 'filled_rectangle') {
                    ctx.fillRect(startX, startY, x - startX, y - startY);
                }
                ctx.strokeRect(startX, startY, x - startX, y - startY);
            } else if (currentTool === 'circle' || currentTool === 'filled_circle') {
                const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
                ctx.beginPath();
                ctx.arc(startX, startY, radius, 0, Math.PI * 2);
                if (currentTool === 'filled_circle') {
                    ctx.fill();
                }
                ctx.stroke();
            } else if (currentTool === 'fill') {
                const fillColor = hexToRGBA(fillColorPicker.value);
                floodFill(x, y, fillColor);
            } else if (currentTool === 'crop') {
                pendingCrop = { x1: startX, y1: startY, x2: x, y2: y };
                cropModal.classList.remove('hidden');
                console.log('Crop modal shown:', pendingCrop);
                return;
            }
            clearPreview();
        } catch (err) {
            console.error('Error in stopDrawing:', err);
        }
    };

    // Modal handlers
    confirmCrop.addEventListener('click', () => {
        try {
            if (pendingCrop) {
                saveCanvasState();
                cropCanvas(pendingCrop.x1, pendingCrop.y1, pendingCrop.x2, pendingCrop.y2);
                pendingCrop = null;
            }
            cropModal.classList.add('hidden');
            clearPreview();
            console.log('Crop confirmed');
        } catch (err) {
            console.error('Error in confirmCrop:', err);
        }
    });

    cancelCrop.addEventListener('click', () => {
        try {
            pendingCrop = null;
            cropModal.classList.add('hidden');
            clearPreview();
            console.log('Crop cancelled');
        } catch (err) {
            console.error('Error in cancelCrop:', err);
        }
    });

    function drawPolygon() {
        saveCanvasState();
        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = strokeWidth.value;
        ctx.beginPath();
        ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
        for (let i = 1; i < polygonPoints.length; i++) {
            ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
        }
        ctx.stroke();
        console.log('Polygon drawn:', polygonPoints);
    }

    // Mouse events
    drawingCanvas.addEventListener('mousedown', (e) => {
        console.log('Mousedown event');
        startDrawing(e);
    });
    drawingCanvas.addEventListener('mousemove', (e) => {
        draw(e);
    });
    drawingCanvas.addEventListener('mouseup', (e) => {
        console.log('Mouseup event');
        stopDrawing(e);
    });
    drawingCanvas.addEventListener('mouseout', () => {
        clearPreview();
        isDrawing = false;
        console.log('Mouseout event');
    });

    // Touch events
    drawingCanvas.addEventListener('touchstart', (e) => {
        console.log('Touchstart event');
        startDrawing(e);
    });
    drawingCanvas.addEventListener('touchmove', (e) => {
        draw(e);
    });
    drawingCanvas.addEventListener('touchend', (e) => {
        console.log('Touchend event');
        stopDrawing(e);
    });
});