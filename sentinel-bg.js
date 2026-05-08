/**
 * SENTINEL - Background Logic
 * Implements a 3D Cyber-Grid and Data Node animation
 */

(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSentinelBackground);
    } else {
        initSentinelBackground();
    }

    function initSentinelBackground() {
        console.log("Sentinel BG Script Initialized - v3");
        if (typeof THREE === 'undefined') {
            console.error('Three.js not loaded');
            return;
        }
        const container = document.getElementById('sentinel-bg-canvas');
        if (!container) return;

        // Scene Setup
        const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Grid System
    const size = 100;
    const divisions = 40;
    const gridColor = 0x39FF14;
    
    // Bottom Grid Plane
    const gridHelper = new THREE.GridHelper(size, divisions, gridColor, gridColor);
    gridHelper.position.y = -10;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.6; // Increased from 0.2
    scene.add(gridHelper);

    // Top Grid Plane (Symmetry)
    const topGrid = new THREE.GridHelper(size, divisions, gridColor, gridColor);
    topGrid.position.y = 20;
    topGrid.material.transparent = true;
    topGrid.material.opacity = 0.3; // Increased from 0.1
    scene.add(topGrid);

    // Data Nodes (Floating Particles)
    const pointsGeometry = new THREE.BufferGeometry();
    const count = 500;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);

    for(let i = 0; i < count * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * size;
        positions[i+1] = Math.random() * 30 - 10;
        positions[i+2] = (Math.random() - 0.5) * size;
        velocities[i/3] = Math.random() * 0.05 + 0.02;
    }

    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const pointsMaterial = new THREE.PointsMaterial({
        color: 0x39FF14,
        size: 0.15, // Increased size
        transparent: true,
        opacity: 0.9, // Increased opacity
        blending: THREE.AdditiveBlending
    });

    const dataNodes = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(dataNodes);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x39FF14, 0.2);
    scene.add(ambientLight);

    camera.position.z = 30;
    camera.position.y = 2;

    // Mouse Interaction
    let mouseX = 0;
    let mouseY = 0;
    window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX - window.innerWidth / 2) / 100;
        mouseY = (e.clientY - window.innerHeight / 2) / 100;
    });

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);

        // Subtle camera movement
        camera.position.x += (mouseX - camera.position.x) * 0.05;
        camera.position.y += (-mouseY + 2 - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        // Rotate grids slightly
        gridHelper.rotation.y += 0.001;
        topGrid.rotation.y -= 0.0005;

        // Animate particles (Data Flow)
        const positions = dataNodes.geometry.attributes.position.array;
        for(let i = 0; i < count; i++) {
            const i3 = i * 3;
            // Move along Z axis
            positions[i3 + 2] += velocities[i];
            
            // Reset if out of bounds
            if(positions[i3 + 2] > size / 2) {
                positions[i3 + 2] = -size / 2;
            }

            // Subtle vertical oscillation
            positions[i3 + 1] += Math.sin(Date.now() * 0.001 + positions[i3]) * 0.01;
        }
        dataNodes.geometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
    }

    // Resize Handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

        animate();
    }
})();
