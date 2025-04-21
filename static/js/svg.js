document.addEventListener('DOMContentLoaded', () => {
    const drawingSvg = document.getElementById('drawingSvg');
    const svgWrapper = document.getElementById('svgWrapper');
    const colorPicker = document.getElementById('colorPicker');
    const strokeWidth = document.getElementById('strokeWidth');
    const strokeWidthValue = document.getElementById('strokeWidthValue');
    const saveButton = document.getElementById('saveButton');
    const toolButtons = document.querySelectorAll('.tool-btn');

    let currentTool = 'pen';
    let isDrawing = false;
    let isDragging = false; // Track click-and-drag for smooth points
    let isDraggingAnchor = false; // Track anchor dragging
    let currentPath = null;
    let pathData = '';
    let scale = 1; // Placeholder for future zoom
    let activePath = null; // Currently selected path
    let boundingBox = null; // Bounding box element
    let bezierPoints = []; // Anchor and control points
    let controlHandles = []; // SVG elements for handles
    let isDraggingHandle = false; // Track handle dragging in select mode
    let draggedHandleIndex = null; // Index of dragged handle
    let previewPath = null; // Temporary preview path
    let dragStartPos = null; // Track drag start
    let startPoint = null; // For closing path

    // Initialize stroke width
    strokeWidthValue.textContent = strokeWidth.value;
    console.log('Initial stroke width:', strokeWidth.value);

    // Update stroke width
    strokeWidth.addEventListener('input', () => {
        strokeWidthValue.textContent = strokeWidth.value;
        if (activePath) {
            activePath.setAttribute('stroke-width', strokeWidth.value);
            updateBoundingBox();
            console.log('Active path stroke width updated:', strokeWidth.value);
        }
        console.log('Stroke width updated:', strokeWidth.value);
    });

    // Update stroke color
    colorPicker.addEventListener('input', () => {
        if (activePath) {
            activePath.setAttribute('stroke', colorPicker.value);
            console.log('Active path stroke color updated:', colorPicker.value);
        }
        console.log('Color updated:', colorPicker.value);
    });

    // Tool selection
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentTool = button.dataset.tool;
            toolButtons.forEach(btn => btn.classList.remove('bg-gray-500'));
            button.classList.add('bg-gray-500');
            if (currentTool !== 'select') {
                selectPath(null); // Deselect when switching
            }
            console.log('Tool selected:', currentTool);
        });
    });

    // Get SVG coordinates
    const getSvgCoords = (e) => {
        const svgRect = drawingSvg.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const x = (clientX - svgRect.left + svgWrapper.scrollLeft) / scale;
        const y = (clientY - svgRect.top + svgWrapper.scrollTop) / scale;
        return { x: Math.floor(x), y: Math.floor(y) };
    };

    // Select or deselect path
    const selectPath = (path) => {
        activePath = path;
        clearControlHandles();
        if (boundingBox) {
            boundingBox.remove();
            boundingBox = null;
        }
        if (activePath) {
            colorPicker.value = activePath.getAttribute('stroke') || '#000000';
            strokeWidth.value = activePath.getAttribute('stroke-width') || 5;
            strokeWidthValue.textContent = strokeWidth.value;
            updateBoundingBox();
            if (currentTool === 'select') {
                updateControlHandles();
            }
            console.log('Path selected:', { stroke: activePath.getAttribute('stroke'), width: activePath.getAttribute('stroke-width') });
        } else {
            console.log('Path deselected');
        }
    };

    // Update bounding box
    const updateBoundingBox = () => {
        if (!activePath) return;
        if (boundingBox) {
            boundingBox.remove();
        }
        const bbox = activePath.getBBox();
        const padding = parseFloat(activePath.getAttribute('stroke-width')) / 2 + 5;
        boundingBox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        boundingBox.setAttribute('x', bbox.x - padding);
        boundingBox.setAttribute('y', bbox.y - padding);
        boundingBox.setAttribute('width', bbox.width + 2 * padding);
        boundingBox.setAttribute('height', bbox.height + 2 * padding);
        boundingBox.setAttribute('class', 'bounding-box');
        drawingSvg.appendChild(boundingBox);
    };

    // Clear control handles
    const clearControlHandles = () => {
        controlHandles.forEach(handle => handle.element.remove());
        controlHandles = [];
    };

    // Update control handles (select mode)
    const updateControlHandles = () => {
        if (!activePath || !activePath.dataset.bezierPoints) return;
        clearControlHandles();
        const points = JSON.parse(activePath.dataset.bezierPoints);
        points.forEach((point, index) => {
            const element = document.createElementNS('http://www.w3.org/2000/svg', point.type === 'anchor' ? 'rect' : 'circle');
            element.setAttribute('x', point.type === 'anchor' ? point.x - 3 : undefined);
            element.setAttribute('y', point.type === 'anchor' ? point.y - 3 : undefined);
            element.setAttribute('width', point.type === 'anchor' ? 6 : undefined);
            element.setAttribute('height', point.type === 'anchor' ? 6 : undefined);
            element.setAttribute('cx', point.type === 'control' ? point.x : undefined);
            element.setAttribute('cy', point.type === 'control' ? point.y : undefined);
            element.setAttribute('r', point.type === 'control' ? 5 : undefined);
            element.setAttribute('class', point.type === 'anchor' ? 'anchor-point' : 'control-point');
            drawingSvg.appendChild(element);
            controlHandles.push({ element, index });

            if (point.type === 'control' && point.anchorIndex !== undefined) {
                const anchorPoint = points[point.anchorIndex];
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', point.x);
                line.setAttribute('y1', point.y);
                line.setAttribute('x2', anchorPoint.x);
                line.setAttribute('y2', anchorPoint.y);
                line.setAttribute('class', 'control-line');
                drawingSvg.appendChild(line);
                controlHandles.push({ element: line });
            }
        });
    };

    // Render handles during drawing
    const renderDrawingHandles = () => {
        clearControlHandles();
        bezierPoints.forEach((point, index) => {
            const element = document.createElementNS('http://www.w3.org/2000/svg', point.type === 'anchor' ? 'rect' : 'circle');
            element.setAttribute('x', point.type === 'anchor' ? point.x - 3 : undefined);
            element.setAttribute('y', point.type === 'anchor' ? point.y - 3 : undefined);
            element.setAttribute('width', point.type === 'anchor' ? 6 : undefined);
            element.setAttribute('height', point.type === 'anchor' ? 6 : undefined);
            element.setAttribute('cx', point.type === 'control' ? point.x : undefined);
            element.setAttribute('cy', point.type === 'control' ? point.y : undefined);
            element.setAttribute('r', point.type === 'control' ? 5 : undefined);
            element.setAttribute('class', point.type === 'anchor' ? 'anchor-point' : 'control-point');
            drawingSvg.appendChild(element);
            controlHandles.push({ element, index });

            if (point.type === 'control' && point.anchorIndex !== undefined) {
                const anchorPoint = bezierPoints[point.anchorIndex];
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', point.x);
                line.setAttribute('y1', point.y);
                line.setAttribute('x2', anchorPoint.x);
                line.setAttribute('y2', anchorPoint.y);
                line.setAttribute('class', 'control-line');
                drawingSvg.appendChild(line);
                controlHandles.push({ element: line });
            }
        });
    };

    // Build Bezier path data (Quadratic)
    const buildBezierPathData = (points) => {
        if (!points.length) return '';
        let d = `M${points[0].x},${points[0].y}`;
        let i = 1;
        while (i < points.length) {
            if (points[i].type === 'control' && i + 1 < points.length && points[i + 1].type === 'anchor') {
                d += ` Q${points[i].x},${points[i].y} ${points[i+1].x},${points[i+1].y}`;
                i += 2;
            } else if (points[i].type === 'anchor') {
                d += ` L${points[i].x},${points[i].y}`;
                i++;
            } else {
                i++;
        }
        }
        return d;
    };

    // Check if click is near start point
    const isNearStartPoint = (x, y) => {
        if (!startPoint) return false;
        const dx = x - startPoint.x;
        const dy = y - startPoint.y;
        return Math.sqrt(dx * dx + dy * dy) < 5;
    };

    // Start drawing or selecting
    const startDrawing = (e) => {
        try {
            e.preventDefault();
            const { x, y } = getSvgCoords(e);
            const target = e.target;

            if (currentTool === 'select') {
                if (target.tagName === 'circle' || target.tagName === 'rect') {
                    isDraggingHandle = true;
                    draggedHandleIndex = controlHandles.find(h => h.element === target)?.index;
                    return;
                }
                if (target.tagName === 'path') {
                selectPath(target);
                } else if (target === drawingSvg) {
                    selectPath(null);
                }
                return;
            }

            // Deselect when starting new drawing
            selectPath(null);

            if (currentTool === 'pen') {
                isDrawing = true;
                pathData = `M${x},${y}`;
                currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                currentPath.setAttribute('d', pathData);
                currentPath.setAttribute('stroke', colorPicker.value);
                currentPath.setAttribute('stroke-width', strokeWidth.value);
                currentPath.setAttribute('fill', 'none');
                currentPath.setAttribute('stroke-linecap', 'round');
                currentPath.setAttribute('stroke-linejoin', 'round');
                drawingSvg.appendChild(currentPath);
            } else if (currentTool === 'bezier') {
                if (!isDrawing) {
                    // Start new curve
                    isDrawing = true;
                    isDragging = false;
                    isDraggingAnchor = true;
                    bezierPoints = [{ type: 'anchor', subtype: 'corner', x, y }];
                    startPoint = { x, y };
                pathData = `M${x},${y}`;
                currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                currentPath.setAttribute('d', pathData);
                currentPath.setAttribute('stroke', colorPicker.value);
                currentPath.setAttribute('stroke-width', strokeWidth.value);
                currentPath.setAttribute('fill', 'none');
                currentPath.setAttribute('stroke-linecap', 'round');
                currentPath.setAttribute('stroke-linejoin', 'round');
                drawingSvg.appendChild(currentPath);
                    renderDrawingHandles();
                } else {
                    // Check for closing path
                    if (isNearStartPoint(x, y)) {
                        pathData += ' Z';
                        currentPath.setAttribute('d', pathData);
                        currentPath.dataset.bezierPoints = JSON.stringify(bezierPoints);
                        isDrawing = false;
                        isDragging = false;
                        isDraggingAnchor = false;
                        currentPath = null;
                        pathData = '';
                        bezierPoints = [];
                        startPoint = null;
                        clearControlHandles();
                        if (previewPath) {
                            previewPath.remove();
                            previewPath = null;
                    }
                        console.log('Path closed');
                        return;
                    }
                    // Start new draggable anchor
                    isDraggingAnchor = true;
                        bezierPoints.push({ type: 'anchor', subtype: 'corner', x, y });
                    pathData = buildBezierPathData(bezierPoints);
                    currentPath.setAttribute('d', pathData);
                    renderDrawingHandles();
            }
                dragStartPos = { x, y };
                console.log('Start drawing:', { tool: currentTool, x, y, isDragging, isDraggingAnchor });
            }
        } catch (err) {
            console.error('Error in startDrawing:', err);
        }
    };

    // Handle mouse move for preview and anchor dragging
    let lastUpdate = 0;
    const draw = (e) => {
        try {
            if (!isDrawing && !isDraggingHandle) return;
            e.preventDefault();
            const now = performance.now();
            if (now - lastUpdate < 16) return; // ~60fps
            lastUpdate = now;

            const { x, y } = getSvgCoords(e);
            if (isDraggingHandle && activePath && draggedHandleIndex !== null) {
                const points = JSON.parse(activePath.dataset.bezierPoints);
                points[draggedHandleIndex].x = x;
                points[draggedHandleIndex].y = y;
                activePath.dataset.bezierPoints = JSON.stringify(points);
                activePath.setAttribute('d', buildBezierPathData(points));
                updateControlHandles();
                console.log('Dragging handle:', { index: draggedHandleIndex, x, y });
            } else if (currentTool === 'pen' && isDrawing) {
                pathData += ` L${x},${y}`;
                currentPath.setAttribute('d', pathData);
            } else if (currentTool === 'bezier' && isDrawing) {
                // Update anchor position if dragging
                if (isDraggingAnchor) {
                    const lastPoint = bezierPoints[bezierPoints.length - 1];
                    lastPoint.x = x;
                    lastPoint.y = y;
                    pathData = buildBezierPathData(bezierPoints);
                    currentPath.setAttribute('d', pathData);
                    renderDrawingHandles();
                }
                // Detect drag for smooth point
                const dx = x - dragStartPos.x;
                const dy = y - dragStartPos.y;
                if (!isDragging && Math.sqrt(dx * dx + dy * dy) > 3) {
                    isDragging = true;
                    // Mark last anchor as smooth
                    const lastPoint = bezierPoints[bezierPoints.length - 1];
                    if (lastPoint.type === 'anchor') {
                        bezierPoints[bezierPoints.length - 1] = {
                            type: 'anchor',
                            subtype: 'smooth',
                            x: lastPoint.x,
                            y: lastPoint.y
                        };
                }
                }
                // Update preview
                if (previewPath) {
                    previewPath.remove();
            }
                previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const tempPoints = [...bezierPoints];
                const lastPoint = bezierPoints[bezierPoints.length - 1];

                if (lastPoint.subtype === 'smooth') {
                    // Add temporary control point for preview
                        tempPoints.push({
                            type: 'control',
                            x: x,
                            y: y,
                            anchorIndex: bezierPoints.length - 1
                        });
                    }
                // Preview to mouse
                tempPoints.push({ type: 'anchor', x, y });
                previewPath.setAttribute('d', buildBezierPathData(tempPoints));
                previewPath.setAttribute('stroke', colorPicker.value);
                previewPath.setAttribute('stroke-width', strokeWidth.value);
                previewPath.setAttribute('stroke-opacity', 0.5);
                previewPath.setAttribute('fill', 'none');
                drawingSvg.appendChild(previewPath);
                console.log('Drawing:', { tool: currentTool, x, y, isDragging, isDraggingAnchor });
            }
        } catch (err) {
            console.error('Error in draw:', err);
        }
    };

    // Handle mouseup
    const handleMouseUp = (e) => {
        try {
            e.preventDefault();
            const { x, y } = getSvgCoords(e);

            if (currentTool === 'bezier' && isDrawing) {
                // Finalize anchor position
                const lastPoint = bezierPoints[bezierPoints.length - 1];
                lastPoint.x = x;
                lastPoint.y = y;
                if (isDragging) {
                // Finalize smooth point with control point
                if (lastPoint.subtype === 'smooth') {
                    bezierPoints.push({
                        type: 'control',
                        x: x,
                        y: y,
                        anchorIndex: bezierPoints.length - 1
                    });
                        console.log('Control point added:', { x, y });
                    }
                }
                pathData = buildBezierPathData(bezierPoints);
                currentPath.setAttribute('d', pathData);
                renderDrawingHandles();
                isDraggingAnchor = false;
                isDragging = false;
            } else if (currentTool === 'pen' && isDrawing) {
                stopDrawing(e);
            }
            dragStartPos = null;
        } catch (err) {
            console.error('Error in handleMouseUp:', err);
        }
    };

    // Stop drawing
    const stopDrawing = (e) => {
        try {
            if (!isDrawing && !isDraggingHandle) return;
            e.preventDefault();
            if (isDraggingHandle) {
                isDraggingHandle = false;
                draggedHandleIndex = null;
            }
            console.log('Stop drawing:', currentTool);
        } catch (err) {
            console.error('Error in stopDrawing:', err);
        }
    };

    // Handle double-click to end Bezier curve
    drawingSvg.addEventListener('dblclick', (e) => {
        if (currentTool === 'bezier' && isDrawing) {
            e.preventDefault();
            isDrawing = false;
            isDragging = false;
            isDraggingAnchor = false;
            if (previewPath) {
                previewPath.remove();
                previewPath = null;
            }
            clearControlHandles();
            if (currentPath) {
                // Remove incomplete segment
                if (bezierPoints.length > 1 && bezierPoints[bezierPoints.length - 1].type === 'anchor') {
                    bezierPoints.pop();
                    pathData = buildBezierPathData(bezierPoints);
                    currentPath.setAttribute('d', pathData);
                }
                currentPath.dataset.bezierPoints = JSON.stringify(bezierPoints);
            }
            currentPath = null;
            pathData = '';
            bezierPoints = [];
            startPoint = null;
            console.log('Bezier curve ended');
        }
    });

    // Save SVG
    saveButton.addEventListener('click', () => {
        try {
            console.log('Saving SVG');
            if (boundingBox) {
                boundingBox.remove();
                boundingBox = null;
            }
            clearControlHandles();
            if (previewPath) {
                previewPath.remove();
                previewPath = null;
            }
            const serializer = new XMLSerializer();
            const svgStr = serializer.serializeToString(drawingSvg);
            const blob = new Blob([svgStr], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'drawing.svg';
            link.click();
            URL.revokeObjectURL(url);
            if (activePath) {
                updateBoundingBox();
                if (currentTool === 'select') {
                    updateControlHandles();
                }
            }
        } catch (err) {
            console.error('Error in saveSVG:', err);
        }
    });

    // Mouse events
    drawingSvg.addEventListener('mousedown', startDrawing);
    drawingSvg.addEventListener('mousemove', (e) => requestAnimationFrame(() => draw(e)));
    drawingSvg.addEventListener('mouseup', handleMouseUp);
    drawingSvg.addEventListener('mouseleave', () => {
        if (!isDrawing && !isDraggingHandle) {
            console.log('Mouseleave event');
        }
    });

    // Touch events
    drawingSvg.addEventListener('touchstart', startDrawing);
    drawingSvg.addEventListener('touchmove', (e) => requestAnimationFrame(() => draw(e)));
    drawingSvg.addEventListener('touchend', handleMouseUp);
});