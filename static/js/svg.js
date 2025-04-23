document.addEventListener('DOMContentLoaded', () => {
    const drawingSvg = document.getElementById('drawingSvg');
    const svgWrapper = document.getElementById('svgWrapper');
    const strokeColor = document.getElementById('strokeColor');
    const fillColor = document.getElementById('fillColor');
    const transparent = document.getElementById('transparent');
    const strokeWidth = document.getElementById('strokeWidth');
    const strokeWidthValue = document.getElementById('strokeWidthValue');
    const xInput = document.getElementById('x');
    const yInput = document.getElementById('y');
    const heightInput = document.getElementById('height');
    const widthInput = document.getElementById('width');
    const updateShapeButton = document.getElementById('updateShapeButton');
    const saveButton = document.getElementById('saveButton');
    const showCodeButton = document.getElementById('showCodeButton');
    const codePanel = document.getElementById('codePanel');
    const closeCodePanel = document.getElementById('closeCodePanel');
    const svgCode = document.getElementById('svgCode');
    const commitCodeButton = document.getElementById('commitCodeButton');
    const shapeProperties = document.getElementById('shapeProperties');
    const toolButtons = document.querySelectorAll('.tool-btn');

    let currentTool = 'pen';
    let isDrawing = false;
    let currentPath = null;
    let pathData = '';
    let scale = 1;
    let activeElement = null;
    let boundingBox = null;
    let bezierPoints = [];
    let controlHandles = [];
    let isDraggingHandle = false;
    let draggedHandleIndex = null;
    let previewPath = null;
    let layers = [{ id: 'layer1', element: null }];
    let currentLayerIndex = 0;
    let rectStart = null;
    let ellipseStart = null;
    let bezierClickCount = 0;

    // Initialize SVG with a default layer
    const initSvg = () => {
        const layerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layerGroup.setAttribute('id', 'layer1');
        drawingSvg.appendChild(layerGroup);
        layers[0].element = layerGroup;
    };
    initSvg();

    // Initialize stroke width
    strokeWidthValue.textContent = strokeWidth.value;
    console.log('Initial stroke width:', strokeWidth.value);

    // Format XML with indentation
    const formatXml = (xml) => {
        let formatted = '';
        let indent = '';
        const indentSize = 2;
        let inTag = false;
        let inDeclaration = false;
        let inText = false;
        let tagStart = '';
        let currentLine = '';

        xml = xml.replace(/>\s*</g, '><').trim();

        for (let i = 0; i < xml.length; i++) {
            const char = xml[i];

            if (char === '<' && xml[i + 1] === '?') {
                inDeclaration = true;
                currentLine += char;
                continue;
            }

            if (inDeclaration) {
                currentLine += char;
                if (char === '>' && xml[i - 1] === '?') {
                    inDeclaration = false;
                    formatted += currentLine + '\n';
                    currentLine = '';
                }
                continue;
            }

            if (char === '<' && xml[i + 1] !== '/') {
                if (!inText && currentLine.trim()) {
                    formatted += indent + currentLine.trim() + '\n';
                    currentLine = '';
                }
                inTag = true;
                tagStart = char;
                currentLine += char;
                continue;
            }

            if (char === '<' && xml[i + 1] === '/') {
                if (!inText && currentLine.trim()) {
                    formatted += indent + currentLine.trim() + '\n';
                    currentLine = '';
                }
                indent = indent.slice(indentSize);
                inTag = true;
                tagStart = char;
                currentLine += char;
                continue;
            }

            if (char === '>' && inTag) {
                inTag = false;
                currentLine += char;
                if (tagStart === '<' && xml[i - 1] !== '/') {
                    formatted += indent + currentLine.trim() + '\n';
                    indent += ' '.repeat(indentSize);
                    inText = true;
                } else if (tagStart === '</') {
                    formatted += indent + currentLine.trim() + '\n';
                    inText = false;
                } else {
                    formatted += indent + currentLine.trim() + '\n';
                }
                currentLine = '';
                continue;
            }

            if (inTag || inText) {
                currentLine += char;
            } else {
                currentLine += char;
                if (char === '\n' || i === xml.length - 1) {
                    if (currentLine.trim()) {
                        formatted += indent + currentLine.trim() + '\n';
                    }
                    currentLine = '';
                }
            }
        }

        if (currentLine.trim()) {
            formatted += indent + currentLine.trim() + '\n';
        }

        return formatted.trim();
    };

    // Toggle fill color based on transparent checkbox
    transparent.addEventListener('change', () => {
        fillColor.disabled = transparent.checked;
        if (activeElement && (activeElement.tagName === 'rect' || activeElement.tagName === 'ellipse')) {
            activeElement.setAttribute('fill', transparent.checked ? 'none' : fillColor.value);
            updateSvgCode();
        }
    });

    // Update stroke width
    strokeWidth.addEventListener('input', () => {
        strokeWidthValue.textContent = strokeWidth.value;
        if (activeElement && (activeElement.tagName === 'path' || activeElement.tagName === 'rect' || activeElement.tagName === 'ellipse')) {
            activeElement.setAttribute('stroke-width', strokeWidth.value);
            updateBoundingBox();
            updateSvgCode();
            console.log('Active element stroke width updated:', strokeWidth.value);
        }
    });

    // Update stroke color
    strokeColor.addEventListener('input', () => {
        if (activeElement && (activeElement.tagName === 'path' || activeElement.tagName === 'rect' || activeElement.tagName === 'ellipse')) {
            activeElement.setAttribute('stroke', strokeColor.value);
            updateSvgCode();
            console.log('Active element stroke color updated:', strokeColor.value);
        }
    });

    // Update fill color
    fillColor.addEventListener('input', () => {
        if (activeElement && (activeElement.tagName === 'rect' || activeElement.tagName === 'ellipse') && !transparent.checked) {
            activeElement.setAttribute('fill', fillColor.value);
            updateSvgCode();
            console.log('Active element fill color updated:', fillColor.value);
        }
    });

    // Tool selection
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentTool = button.dataset.tool;
            toolButtons.forEach(btn => btn.classList.remove('bg-gray-500'));
            button.classList.add('bg-gray-500');
            shapeProperties.classList.toggle('hidden', !['rectangle', 'ellipse'].includes(currentTool));
            if (currentTool !== 'select') {
                selectElement(null);
            }
            resetDrawingState();
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
        console.log('Get SVG coords:', { clientX, clientY, svgRectLeft: svgRect.left, svgRectTop: svgRect.top, scrollLeft: svgWrapper.scrollLeft, scrollTop: svgWrapper.scrollTop, scale, x, y });
        return { x: Math.floor(x), y: Math.floor(y) };
    };

    // Select or deselect element
    const selectElement = (element) => {
        activeElement = element;
        clearControlHandles();
        if (boundingBox) {
            boundingBox.remove();
            boundingBox = null;
        }
        shapeProperties.classList.add('hidden');

        // Reset input states
        [strokeColor, fillColor, transparent, strokeWidth, xInput, yInput, widthInput, heightInput].forEach(input => {
                input.removeAttribute('disabled');
                input.removeAttribute('readonly');
            });

        if (activeElement) {
            shapeProperties.classList.remove('hidden');
            strokeColor.value = activeElement.getAttribute('stroke') || '#ff0000';
                strokeWidth.value = parseFloat(activeElement.getAttribute('stroke-width') || 5);
                strokeWidthValue.textContent = strokeWidth.value;

            if (activeElement.tagName === 'path') {
                [fillColor, transparent, xInput, yInput, widthInput, heightInput].forEach(input => input.disabled = true);
                transparent.checked = false;
                fillColor.disabled = true;
                if (currentTool === 'select' && activeElement.dataset.bezierPoints) {
                    updateControlHandles();
                }
            } else if (activeElement.tagName === 'rect') {
                const fill = activeElement.getAttribute('fill') || '#ffffff';
                transparent.checked = fill === 'none';
                fillColor.disabled = transparent.checked;
                fillColor.value = fill !== 'none' ? fill : '#ffffff';
                xInput.value = parseFloat(activeElement.getAttribute('x') || 0);
                yInput.value = parseFloat(activeElement.getAttribute('y') || 0);
                widthInput.value = parseFloat(activeElement.getAttribute('width') || 100);
                heightInput.value = parseFloat(activeElement.getAttribute('height') || 100);
                console.log('Rectangle selected:', {
                    fill: transparent.checked ? 'none' : fillColor.value,
                    stroke: strokeColor.value,
                    strokeWidth: strokeWidth.value,
                    x: xInput.value,
                    y: yInput.value,
                    width: widthInput.value,
                    height: heightInput.value
                });
            } else if (activeElement.tagName === 'ellipse') {
                const fill = activeElement.getAttribute('fill') || '#ffffff';
                transparent.checked = fill === 'none';
                fillColor.disabled = transparent.checked;
                fillColor.value = fill !== 'none' ? fill : '#ffffff';
                const cx = parseFloat(activeElement.getAttribute('cx') || 50);
                const cy = parseFloat(activeElement.getAttribute('cy') || 50);
                const rx = parseFloat(activeElement.getAttribute('rx') || 50);
                const ry = parseFloat(activeElement.getAttribute('ry') || 50);
                xInput.value = cx - rx;
                yInput.value = cy - ry;
                widthInput.value = rx * 2;
                heightInput.value = ry * 2;
                console.log('Ellipse selected:', {
                    fill: transparent.checked ? 'none' : fillColor.value,
                    stroke: strokeColor.value,
                    strokeWidth: strokeWidth.value,
                    x: xInput.value,
                    y: yInput.value,
                    width: widthInput.value,
                    height: heightInput.value
                });
            }
            updateBoundingBox();
        } else if (['rectangle', 'ellipse'].includes(currentTool)) {
            shapeProperties.classList.remove('hidden');
            [fillColor, transparent, xInput, yInput, widthInput, heightInput].forEach(input => input.disabled = false);
        }
        updateSvgCode();
    };

    // Update bounding box
    const updateBoundingBox = () => {
        if (!activeElement) return;
        if (boundingBox) {
            boundingBox.remove();
        }
        const bbox = activeElement.getBBox();
        const padding = parseFloat(activeElement.getAttribute('stroke-width')) / 2 + 5;
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

    // Render Bezier points (squares for anchors, circles for controls)
    const renderPoints = () => {
        clearControlHandles();
        bezierPoints.forEach((point, index) => {
            let element;
            if (point.type === 'anchor') {
                element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                element.setAttribute('x', point.x - 5);
                element.setAttribute('y', point.y - 5);
                element.setAttribute('width', 10);
                element.setAttribute('height', 10);
                element.setAttribute('class', 'anchor-point');
            } else {
                element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            element.setAttribute('cx', point.x);
            element.setAttribute('cy', point.y);
                element.setAttribute('r', 5);
                element.setAttribute('class', 'control-point');
            }
            drawingSvg.appendChild(element);
            controlHandles.push({ element, index });
        });
    };

    // Render dotted lines between consecutive points
    const renderDottedLines = () => {
        for (let i = 1; i < bezierPoints.length; i++) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', bezierPoints[i - 1].x);
            line.setAttribute('y1', bezierPoints[i - 1].y);
            line.setAttribute('x2', bezierPoints[i].x);
            line.setAttribute('y2', bezierPoints[i].y);
            line.setAttribute('class', 'control-line');
                drawingSvg.appendChild(line);
                controlHandles.push({ element: line });
            }
    };

    // Update control handles (select mode for Bezier paths)
    const updateControlHandles = () => {
        if (!activeElement || activeElement.tagName !== 'path' || !activeElement.dataset.bezierPoints) return;
        clearControlHandles();
        const points = JSON.parse(activeElement.dataset.bezierPoints);
        points.forEach((point, index) => {
            let element;
            if (point.type === 'anchor') {
                element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                element.setAttribute('x', point.x - 5);
                element.setAttribute('y', point.y - 5);
                element.setAttribute('width', 10);
                element.setAttribute('height', 10);
                element.setAttribute('class', 'anchor-point');
            } else {
                element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            element.setAttribute('cx', point.x);
            element.setAttribute('cy', point.y);
                element.setAttribute('r', 5);
                element.setAttribute('class', 'control-point');
            }
            drawingSvg.appendChild(element);
            controlHandles.push({ element, index });

            if (index > 0) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', points[index - 1].x);
                line.setAttribute('y1', points[index - 1].y);
                line.setAttribute('x2', point.x);
                line.setAttribute('y2', point.y);
                line.setAttribute('class', 'control-line');
                drawingSvg.appendChild(line);
                controlHandles.push({ element: line });
            }
        });
    };

    // Build Bezier path data
    const buildBezierPathData = (points) => {
        if (points.length < 1) return '';
        let d = `M${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length - 2; i += 3) {
            if (points[i] && points[i + 1] && points[i + 2]) {
                    d += ` C${points[i].x},${points[i].y} ${points[i + 1].x},${points[i + 1].y} ${points[i + 2].x},${points[i + 2].y}`;
                }
            }
        console.log('Path data:', { d, pointsLength: points.length });
        return d;
    };

    // Check if click is on the first anchor
    const isOnFirstAnchor = (x, y) => {
        if (bezierPoints.length < 1) return false;
        const firstAnchor = bezierPoints[0];
        if (firstAnchor.type !== 'anchor') return false;
        const dx = x - firstAnchor.x;
        const dy = y - firstAnchor.y;
        return Math.sqrt(dx * dx + dy * dy) < 5;
    };

    // Check if click is on the last anchor
    const isOnLastAnchor = (x, y) => {
        if (bezierPoints.length < 1) return false;
        const lastAnchor = bezierPoints[bezierPoints.length - 1];
        if (lastAnchor.type !== 'anchor') return false;
        const dx = x - lastAnchor.x;
        const dy = y - lastAnchor.y;
        return Math.sqrt(dx * dx + dy * dy) < 5;
    };

    // Reset drawing state
    const resetDrawingState = () => {
        if (currentPath && bezierPoints.length >= 1) {
            currentPath.dataset.bezierPoints = JSON.stringify(bezierPoints);
            currentPath.setAttribute('d', pathData);
            currentPath = null;
        }
        isDrawing = false;
        pathData = '';
        bezierPoints = [];
        bezierClickCount = 0;
        clearControlHandles();
        if (previewPath) {
            previewPath.remove();
            previewPath = null;
        }
        console.log('Drawing state reset, paths in SVG:', drawingSvg.getElementsByTagName('path').length);
        updateSvgCode();
    };

    // Generate SVG code with layers
    const generateSvgCode = () => {
        const svgNS = 'http://www.w3.org/2000/svg';
        const newSvg = document.createElementNS(svgNS, 'svg');
        newSvg.setAttribute('width', '12cm');
        newSvg.setAttribute('height', '6cm');
        newSvg.setAttribute('viewBox', '0 0 1550 850');
        newSvg.setAttribute('xmlns', svgNS);
        newSvg.setAttribute('version', '1.1');

        const title = document.createElementNS(svgNS, 'title');
        title.textContent = 'Multi-Segment Cubic Bezier Curve';
        newSvg.appendChild(title);

        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', '1');
        rect.setAttribute('y', '1');
        rect.setAttribute('width', '1500');
        rect.setAttribute('height', '800');
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', 'blue');
        rect.setAttribute('stroke-width', '1');
        newSvg.appendChild(rect);

        layers.forEach(layer => {
            const group = document.createElementNS(svgNS, 'g');
            group.setAttribute('id', layer.id);
            const shapes = layer.element.children;
            for (let shape of shapes) {
                if (shape !== previewPath) {
                    const newShape = document.createElementNS(svgNS, shape.tagName);
                    if (shape.tagName === 'path') {
                        newShape.setAttribute('d', shape.getAttribute('d') || '');
                        newShape.setAttribute('fill', shape.getAttribute('fill') || 'none');
                    } else if (shape.tagName === 'rect') {
                        newShape.setAttribute('x', shape.getAttribute('x') || '0');
                        newShape.setAttribute('y', shape.getAttribute('y') || '0');
                        newShape.setAttribute('width', shape.getAttribute('width') || '100');
                        newShape.setAttribute('height', shape.getAttribute('height') || '100');
                        newShape.setAttribute('fill', shape.getAttribute('fill') || '#ffffff');
                    } else if (shape.tagName === 'ellipse') {
                        newShape.setAttribute('cx', shape.getAttribute('cx') || '50');
                        newShape.setAttribute('cy', shape.getAttribute('cy') || '50');
                        newShape.setAttribute('rx', shape.getAttribute('rx') || '50');
                        newShape.setAttribute('ry', shape.getAttribute('ry') || '50');
                        newShape.setAttribute('fill', shape.getAttribute('fill') || '#ffffff');
                    }
                    newShape.setAttribute('stroke', shape.getAttribute('stroke') || 'red');
                    newShape.setAttribute('stroke-width', shape.getAttribute('stroke-width') || '5');
                    group.appendChild(newShape);
                            }
                    }
            newSvg.appendChild(group);
        });

        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(newSvg);
        return `<?xml version="1.0" standalone="no"?>\n${svgStr}`;
    };

    // Update SVG code in textarea if open
    const updateSvgCode = () => {
        if (!codePanel.classList.contains('hidden')) {
            const rawSvgCode = generateSvgCode();
            svgCode.value = formatXml(rawSvgCode);
            console.log('SVG code updated in textarea with formatting');
        }
    };

    // Commit edited SVG code to canvas
    const commitSvgCode = () => {
        try {
            const parser = new DOMParser();
            const xmlStr = svgCode.value;
            const doc = parser.parseFromString(xmlStr, 'image/svg+xml');
            const svgElement = doc.querySelector('svg');
            if (!svgElement) {
                alert('Invalid SVG: No <svg> element found.');
                return;
            }

            layers.forEach(layer => layer.element.remove());
            layers = [];

            const groups = svgElement.querySelectorAll('g');
            groups.forEach((group, index) => {
                const layerId = group.getAttribute('id') || `layer${index + 1}`;
                const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                newGroup.setAttribute('id', layerId);
                drawingSvg.appendChild(newGroup);
                layers.push({ id: layerId, element: newGroup });

                const shapes = group.children;
                for (let shape of shapes) {
                    if (shape.tagName === 'path' || shape.tagName === 'rect' || shape.tagName === 'ellipse') {
                        const newShape = document.createElementNS('http://www.w3.org/2000/svg', shape.tagName);
                        newShape.setAttribute('fill', shape.getAttribute('fill') || (shape.tagName === 'path' ? 'none' : '#ffffff'));
                        newShape.setAttribute('stroke', shape.getAttribute('stroke') || 'red');
                        newShape.setAttribute('stroke-width', shape.getAttribute('stroke-width') || '5');
                        if (shape.tagName === 'path') {
                            newShape.setAttribute('d', shape.getAttribute('d') || '');
                        } else if (shape.tagName === 'rect') {
                            newShape.setAttribute('x', shape.getAttribute('x') || '0');
                            newShape.setAttribute('y', shape.getAttribute('y') || '0');
                            newShape.setAttribute('width', shape.getAttribute('width') || '100');
                            newShape.setAttribute('height', shape.getAttribute('height') || '100');
                        } else if (shape.tagName === 'ellipse') {
                            newShape.setAttribute('cx', shape.getAttribute('cx') || '50');
                            newShape.setAttribute('cy', shape.getAttribute('cy') || '50');
                            newShape.setAttribute('rx', shape.getAttribute('rx') || '50');
                            newShape.setAttribute('ry', shape.getAttribute('ry') || '50');
                        }
                        newGroup.appendChild(newShape);
                    }
                }
            });

            if (layers.length === 0) {
                const layerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                layerGroup.setAttribute('id', 'layer1');
                drawingSvg.appendChild(layerGroup);
                layers.push({ id: 'layer1', element: layerGroup });
            }
            currentLayerIndex = layers.length - 1;

            selectElement(null);
            updateSvgCode();
            console.log('SVG code committed, layers updated:', layers.length);
        } catch (err) {
            alert('Invalid SVG XML: ' + err.message);
            console.error('Error committing SVG code:', err);
        }
    };

    // Update shape properties
    const updateShape = () => {
        if (!activeElement) return;
        const fill = transparent.checked ? 'none' : fillColor.value;
        activeElement.setAttribute('stroke', strokeColor.value || '#ff0000');
        activeElement.setAttribute('stroke-width', strokeWidth.value || 5);

        if (activeElement.tagName === 'path') {
            updateSvgCode();
            console.log('Path updated:', {
                stroke: strokeColor.value,
                strokeWidth: strokeWidth.value
            });
        } else if (activeElement.tagName === 'rect') {
            const x = parseFloat(xInput.value) || 0;
            const y = parseFloat(yInput.value) || 0;
            const width = parseFloat(widthInput.value) || 100;
            const height = parseFloat(heightInput.value) || 100;
            activeElement.setAttribute('fill', fill);
            activeElement.setAttribute('x', x);
            activeElement.setAttribute('y', y);
            activeElement.setAttribute('width', Math.max(1, width));
            activeElement.setAttribute('height', Math.max(1, height));
            fillColor.disabled = transparent.checked;
            updateBoundingBox();
            updateSvgCode();
            console.log('Rectangle updated:', {
                fill,
                stroke: strokeColor.value,
                strokeWidth: strokeWidth.value,
                x,
                y,
                width,
                height
            });
        } else if (activeElement.tagName === 'ellipse') {
            const width = parseFloat(widthInput.value) || 100;
            const height = parseFloat(heightInput.value) || 100;
            const x = parseFloat(xInput.value) || 0;
            const y = parseFloat(yInput.value) || 0;
            const rx = Math.max(1, width / 2);
            const ry = Math.max(1, height / 2);
            const cx = x + rx;
            const cy = y + ry;
            activeElement.setAttribute('fill', fill);
            activeElement.setAttribute('cx', cx);
            activeElement.setAttribute('cy', cy);
            activeElement.setAttribute('rx', rx);
            activeElement.setAttribute('ry', ry);
            fillColor.disabled = transparent.checked;
            updateBoundingBox();
            updateSvgCode();
            console.log('Ellipse updated:', {
                fill,
                stroke: strokeColor.value,
                strokeWidth: strokeWidth.value,
                x,
                y,
                width,
                height,
                cx,
                cy,
                rx,
                ry
            });
        }
    };

    // Start drawing or selecting
    const startDrawing = (e) => {
        try {
            e.preventDefault();
            const { x, y } = getSvgCoords(e);
            const target = e.target;
            console.log('Mouse down:', { x, y, bezierClickCount, isDrawing, target: target.tagName });

            if (currentTool === 'select') {
                if ((target.tagName === 'circle' || target.tagName === 'rect') && activeElement && activeElement.tagName === 'path') {
                    isDraggingHandle = true;
                    draggedHandleIndex = controlHandles.find(h => h.element === target)?.index;
                    return;
                }
                if (target.tagName === 'path' || target.tagName === 'rect' || target.tagName === 'ellipse') {
                    selectElement(target);
                } else if (target === drawingSvg || target.tagName === 'g') {
                    selectElement(null);
                }
                return;
            }

            selectElement(null);

            if (currentTool === 'pen') {
                isDrawing = true;
                pathData = `M${x},${y}`;
                currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                currentPath.setAttribute('d', pathData);
                currentPath.setAttribute('stroke', strokeColor.value);
                currentPath.setAttribute('stroke-width', strokeWidth.value);
                currentPath.setAttribute('fill', 'none');
                currentPath.setAttribute('stroke-linecap', 'round');
                currentPath.setAttribute('stroke-linejoin', 'round');
                layers[currentLayerIndex].element.appendChild(currentPath);
                updateSvgCode();
            } else if (currentTool === 'bezier') {
                if (!isDrawing) {
                    isDrawing = true;
                    bezierClickCount = 1;
                    bezierPoints = [{ type: 'anchor', x, y }];
                    pathData = `M${x},${y}`;
                    currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    currentPath.setAttribute('d', pathData);
                    currentPath.setAttribute('stroke', strokeColor.value);
                    currentPath.setAttribute('stroke-width', strokeWidth.value);
                    currentPath.setAttribute('fill', 'none');
                    layers[currentLayerIndex].element.appendChild(currentPath);
                    renderPoints();
                    console.log('Bezier first anchor:', { x, y });
                    updateSvgCode();
                } else {
                    bezierClickCount++;
                    if (bezierClickCount === 2) {
                        bezierPoints.push({ type: 'control1', x, y });
                        renderPoints();
                        renderDottedLines();
                        console.log('Bezier first control:', { x, y });
                    } else if (bezierClickCount === 3) {
                        bezierPoints.push({ type: 'control2', x, y });
                        renderPoints();
                        renderDottedLines();
                        console.log('Bezier second control:', { x, y });
                    } else if (bezierClickCount >= 4 && (isOnFirstAnchor(x, y) || isOnLastAnchor(x, y))) {
                        pathData = buildBezierPathData(bezierPoints);
                        if (isOnFirstAnchor(x, y) && bezierClickCount >= 4) {
                            pathData += ' Z';
                            console.log('Bezier path closed on first anchor:', { x, y });
                        } else {
                            console.log('Bezier path finalized on last anchor:', { x, y });
                        }
                        currentPath.setAttribute('d', pathData);
                        resetDrawingState();
                    } else if (bezierClickCount === 4) {
                    bezierPoints.push({ type: 'anchor', x, y });
                    pathData = buildBezierPathData(bezierPoints);
                    currentPath.setAttribute('d', pathData);
                        renderPoints();
                        renderDottedLines();
                        console.log('Bezier second anchor:', { x, y });
                    } else if (bezierClickCount === 5) {
                        bezierPoints.push({ type: 'control1', x, y });
                        renderPoints();
                        renderDottedLines();
                        console.log('Bezier third control:', { x, y });
                    } else if (bezierClickCount === 6) {
                        bezierPoints.push({ type: 'control2', x, y });
                        renderPoints();
                        renderDottedLines();
                        console.log('Bezier fourth control:', { x, y });
                    } else if (bezierClickCount === 7) {
                        bezierPoints.push({ type: 'anchor', x, y });
                        pathData = buildBezierPathData(bezierPoints);
                        currentPath.setAttribute('d', pathData);
                        renderPoints();
                        renderDottedLines();
                        console.log('Bezier third anchor:', { x, y });
                    } else if (bezierClickCount >= 8) {
                            const mod = (bezierClickCount - 7) % 3;
                            if (mod === 1) {
                                bezierPoints.push({ type: 'control1', x, y });
                                console.log('Bezier next control1:', { x, y });
                            } else if (mod === 2) {
                                bezierPoints.push({ type: 'control2', x, y });
                                console.log('Bezier next control2:', { x, y });
                            } else if (mod === 0) {
                    bezierPoints.push({ type: 'anchor', x, y });
                    pathData = buildBezierPathData(bezierPoints);
                    currentPath.setAttribute('d', pathData);
                                console.log('Bezier next anchor:', { x, y });
                            }
                            renderPoints();
                            renderDottedLines();
                        }
                    updateSvgCode();
                }
            } else if (currentTool === 'rectangle') {
                isDrawing = true;
                rectStart = { x, y };
                currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                currentPath.setAttribute('x', x);
                currentPath.setAttribute('y', y);
                currentPath.setAttribute('width', 0);
                currentPath.setAttribute('height', 0);
                currentPath.setAttribute('fill', transparent.checked ? 'none' : fillColor.value);
                currentPath.setAttribute('stroke', strokeColor.value);
                currentPath.setAttribute('stroke-width', strokeWidth.value);
                layers[currentLayerIndex].element.appendChild(currentPath);
                shapeProperties.classList.remove('hidden');
                xInput.value = x;
                yInput.value = y;
                widthInput.value = 0;
                heightInput.value = 0;
                updateSvgCode();
            } else if (currentTool === 'ellipse') {
                isDrawing = true;
                ellipseStart = { x, y };
                currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                currentPath.setAttribute('cx', x);
                currentPath.setAttribute('cy', y);
                currentPath.setAttribute('rx', 0);
                currentPath.setAttribute('ry', 0);
                currentPath.setAttribute('fill', transparent.checked ? 'none' : fillColor.value);
                currentPath.setAttribute('stroke', strokeColor.value);
                currentPath.setAttribute('stroke-width', strokeWidth.value);
                layers[currentLayerIndex].element.appendChild(currentPath);
                shapeProperties.classList.remove('hidden');
                xInput.value = x;
                yInput.value = y;
                widthInput.value = 0;
                heightInput.value = 0;
                updateSvgCode();
            }
        } catch (err) {
            console.error('Error in startDrawing:', err);
        }
    };

    // Handle mouse move for preview
    let lastUpdate = 0;
    const draw = (e) => {
        try {
            if (!isDrawing && !isDraggingHandle) return;
            e.preventDefault();
            const now = performance.now();
            if (now - lastUpdate < 16) return;
            lastUpdate = now;

            const { x, y } = getSvgCoords(e);
            console.log('Mouse move:', { x, y, bezierClickCount, isDrawing });

            if (isDraggingHandle && activeElement && activeElement.tagName === 'path' && draggedHandleIndex !== null) {
                const points = JSON.parse(activeElement.dataset.bezierPoints);
                points[draggedHandleIndex].x = x;
                points[draggedHandleIndex].y = y;
                activeElement.dataset.bezierPoints = JSON.stringify(points);
                activeElement.setAttribute('d', buildBezierPathData(points));
                updateControlHandles();
                console.log('Dragging handle:', { index: draggedHandleIndex, x, y });
                updateSvgCode();
            } else if (currentTool === 'pen' && isDrawing) {
                pathData += ` L${x},${y}`;
                currentPath.setAttribute('d', pathData);
                updateSvgCode();
            } else if (currentTool === 'bezier' && isDrawing && bezierPoints.length >= 1) {
                if (previewPath) {
                    previewPath.remove();
                }
                previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const tempPoints = [...bezierPoints, { type: 'temp', x, y }];
                previewPath.setAttribute('d', buildBezierPathData(tempPoints));
                previewPath.setAttribute('stroke', strokeColor.value);
                previewPath.setAttribute('stroke-width', strokeWidth.value);
                previewPath.setAttribute('stroke-opacity', 0.5);
                previewPath.setAttribute('fill', 'none');
                layers[currentLayerIndex].element.appendChild(previewPath);
                clearControlHandles();
                renderPoints();
                renderDottedLines();
                const lastLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                lastLine.setAttribute('x1', bezierPoints[bezierPoints.length - 1].x);
                lastLine.setAttribute('y1', bezierPoints[bezierPoints.length - 1].y);
                lastLine.setAttribute('x2', x);
                lastLine.setAttribute('y2', y);
                lastLine.setAttribute('class', 'control-line');
                drawingSvg.appendChild(lastLine);
                controlHandles.push({ element: lastLine });
                console.log('Bezier preview:', { x, y, tempPoints });
                updateSvgCode();
            } else if (currentTool === 'rectangle' && isDrawing) {
                const width = Math.abs(x - rectStart.x);
                const height = Math.abs(y - rectStart.y);
                const minX = Math.min(x, rectStart.x);
                const minY = Math.min(y, rectStart.y);
                currentPath.setAttribute('x', minX);
                currentPath.setAttribute('y', minY);
                currentPath.setAttribute('width', width);
                currentPath.setAttribute('height', height);
                xInput.value = minX;
                yInput.value = minY;
                widthInput.value = width;
                heightInput.value = height;
                updateSvgCode();
            } else if (currentTool === 'ellipse' && isDrawing) {
                const width = Math.abs(x - ellipseStart.x);
                const height = Math.abs(y - ellipseStart.y);
                const minX = Math.min(x, ellipseStart.x);
                const minY = Math.min(y, ellipseStart.y);
                const rx = width / 2;
                const ry = height / 2;
                const cx = minX + rx;
                const cy = minY + ry;
                currentPath.setAttribute('cx', cx);
                currentPath.setAttribute('cy', cy);
                currentPath.setAttribute('rx', rx);
                currentPath.setAttribute('ry', ry);
                xInput.value = minX;
                yInput.value = minY;
                widthInput.value = width;
                heightInput.value = height;
                updateSvgCode();
            }
        } catch (err) {
            console.error('Error in draw:', err);
        }
    };

    // Handle pointer up
    const handlePointerUp = (e) => {
        try {
            const { x, y } = getSvgCoords(e);
            console.log('Pointer up:', { x, y, bezierClickCount, isDrawing, currentTool });

            if (currentTool === 'pen' && isDrawing) {
                pathData += ` L${x},${y}`;
                currentPath.setAttribute('d', pathData);
                isDrawing = false;
                currentPath = null;
                pathData = '';
                updateSvgCode();
            } else if (currentTool === 'rectangle' && isDrawing) {
                isDrawing = false;
                selectElement(currentPath);
                currentPath = null;
                rectStart = null;
                updateSvgCode();
            } else if (currentTool === 'ellipse' && isDrawing) {
                isDrawing = false;
                selectElement(currentPath);
                currentPath = null;
                ellipseStart = null;
                updateSvgCode();
            }
            isDraggingHandle = false;
            draggedHandleIndex = null;
        } catch (err) {
            console.error('Error in handlePointerUp:', err);
        }
    };

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

            const svgStr = generateSvgCode();
            const blob = new Blob([svgStr], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'drawing.svg';
            link.click();
            URL.revokeObjectURL(url);
            if (activeElement) {
                updateBoundingBox();
                if (currentTool === 'select' && activeElement.tagName === 'path') {
                    updateControlHandles();
                }
            }
            updateSvgCode();
        } catch (err) {
            console.error('Error in saveSVG:', err);
        }
    });

    // Show/hide code panel
    showCodeButton.addEventListener('click', () => {
        if (codePanel.classList.contains('hidden')) {
            updateSvgCode();
            codePanel.classList.remove('hidden');
            console.log('Code panel opened, SVG code displayed');
        } else {
            codePanel.classList.add('hidden');
            svgCode.value = '';
            console.log('Code panel closed');
        }
    });

    // Close code panel
    closeCodePanel.addEventListener('click', () => {
        codePanel.classList.add('hidden');
        svgCode.value = '';
        console.log('Code panel closed via close button');
    });

    // Commit code changes
    commitCodeButton.addEventListener('click', commitSvgCode);

    // Update shape properties
    updateShapeButton.addEventListener('click', updateShape);

    // Mouse and pointer events
    drawingSvg.addEventListener('mousedown', startDrawing);
    drawingSvg.addEventListener('mousemove', (e) => requestAnimationFrame(() => draw(e)));
    drawingSvg.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointerup', handlePointerUp);
    drawingSvg.addEventListener('mouseleave', () => {
        if (!isDrawing && !isDraggingHandle) {
            console.log('Mouseleave event');
        }
    });

    // Touch events
    drawingSvg.addEventListener('touchstart', startDrawing);
    drawingSvg.addEventListener('touchmove', (e) => requestAnimationFrame(() => draw(e)));
    drawingSvg.addEventListener('touchend', handlePointerUp);
});