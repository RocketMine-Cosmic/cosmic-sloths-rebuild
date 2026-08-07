export class WebGLBackground {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false });
        if (!this.gl) {
            console.error("WebGL2 not supported, falling back to 2D canvas");
            return;
        }

        const gl = this.gl;
        
        const vsSource = `#version 300 es
        in vec2 a_position;
        out vec2 v_uv;
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }`;

        const fsSource = `#version 300 es
        precision mediump float;
        in vec2 v_uv;
        out vec4 outColor;

        uniform sampler2D u_image;
        uniform vec2 u_resolution;
        uniform vec2 u_texResolution;
        uniform vec2 u_cameraCenter;
        uniform float u_time;
        uniform float u_zoom;

        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        float noise(vec2 st) {
            vec2 i = floor(st);
            vec2 f = fract(st);
            float a = random(i);
            float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0));
            float d = random(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
            vec2 uv = v_uv;
            uv.y = 1.0 - uv.y; // WebGL is bottom-up, match canvas 2D
            
            float scaleX = u_resolution.x / u_texResolution.x;
            float scaleY = u_resolution.y / u_texResolution.y;
            float scale = max(scaleX, scaleY);
            
            vec2 screenTexSize = u_resolution / scale;
            vec2 uvCover = (uv - 0.5) * (screenTexSize / u_texResolution) / u_zoom;
            
            vec2 worldCenterUV = u_cameraCenter / u_texResolution;
            
            // Layer 1: Base Image (slowest)
            vec2 baseUV = (uvCover * 0.35) + 0.5 + worldCenterUV * 0.2;
            
            // Nebula Drift (subtle warping)
            float drift = noise(baseUV * 2.0 + u_time * 0.05) * 0.02;
            vec4 baseColor = texture(u_image, baseUV + vec2(drift, drift));
            
            // Highlight bloom on base color
            float luminance = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
            vec3 bloom = baseColor.rgb * smoothstep(0.6, 1.0, luminance) * 0.15;
            baseColor.rgb += bloom;
            
            // Layer 2: Dense Twinkling Stars (medium parallax)
            vec2 starUV = uvCover * u_texResolution * 0.01 + worldCenterUV * 0.4;
            float starGrid = random(floor(starUV));
            float starDist = length(fract(starUV) - 0.5);
            float starGlow = 0.0;
            if (starGrid > 0.95) {
                float twinkle = sin(u_time * 2.0 + starGrid * 100.0) * 0.5 + 0.5;
                starGlow = smoothstep(0.4, 0.05, starDist) * twinkle * 0.6;
            } else if (starGrid > 0.8) {
                float twinkle = sin(u_time * 1.5 + starGrid * 50.0) * 0.5 + 0.5;
                starGlow = smoothstep(0.2, 0.02, starDist) * twinkle * 0.3;
            }
            vec3 starColor = vec3(0.6, 0.7, 0.8) * starGlow;
            
            // Layer 3: Faint Glowing Dust (fastest parallax)
            vec2 dustUV = uvCover * u_texResolution * 0.005 + worldCenterUV * 0.6;
            float dustNoise = noise(dustUV + vec2(u_time * 0.05, u_time * 0.05));
            vec3 dustColor = vec3(0.4, 0.7, 1.0) * smoothstep(0.5, 0.9, dustNoise) * 0.1;
            
            // Combine
            vec3 finalColor = baseColor.rgb + starColor + dustColor;
            
            // Re-apply a gentle 0.9 opacity overlay equivalent to the old logic if needed, 
            // but the bloom makes it look good natively.
            outColor = vec4(finalColor, 1.0);
        }`;

        const compileShader = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vs = compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
        
        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(this.program));
        }

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ]), gl.STATIC_DRAW);

        this.positionLoc = gl.getAttribLocation(this.program, "a_position");
        gl.enableVertexAttribArray(this.positionLoc);
        gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 0, 0);

        this.texture = gl.createTexture();
        this.texResolution = [1024, 1024]; // default
        
        this.uniforms = {
            u_image: gl.getUniformLocation(this.program, "u_image"),
            u_resolution: gl.getUniformLocation(this.program, "u_resolution"),
            u_texResolution: gl.getUniformLocation(this.program, "u_texResolution"),
            u_cameraCenter: gl.getUniformLocation(this.program, "u_cameraCenter"),
            u_time: gl.getUniformLocation(this.program, "u_time"),
            u_zoom: gl.getUniformLocation(this.program, "u_zoom")
        };
    }

    setImage(image) {
        if (!this.gl || !image || !image.complete || image.naturalWidth === 0) return;
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        
        // Use MIRRORED_REPEAT for perfect seamless tiling without visible edge seams
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        this.texResolution = [image.naturalWidth, image.naturalHeight];
    }

    resize(w, h) {
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            if (this.gl) {
                this.gl.viewport(0, 0, w, h);
            }
        }
    }

    render(time, camCenterX, camCenterY, zoom) {
        if (!this.gl) return this.canvas;
        const gl = this.gl;
        
        gl.useProgram(this.program);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.uniforms.u_image, 0);
        
        gl.uniform2f(this.uniforms.u_resolution, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.uniforms.u_texResolution, this.texResolution[0], this.texResolution[1]);
        gl.uniform2f(this.uniforms.u_cameraCenter, camCenterX, camCenterY);
        gl.uniform1f(this.uniforms.u_time, time);
        gl.uniform1f(this.uniforms.u_zoom, zoom);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        return this.canvas;
    }
}