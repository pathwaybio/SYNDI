#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Simple HTTP server for serving CLAIRE webapp files
Emulates CloudFront+S3 behavior for local testing
Includes simple proxy for /api requests (like CloudFront routing)
"""

import http.server
import socketserver
import os
import sys
import time
import signal
import json
import urllib.request
import urllib.error
from pathlib import Path

class CloudFrontEmulator(http.server.SimpleHTTPRequestHandler):
    backend_url = None  # Will be set from config
    
    def __init__(self, *args, **kwargs):
        # Set the directory to serve from
        super().__init__(*args, directory=os.getcwd(), **kwargs)
    
    def end_headers(self):
        # Add CloudFront-like headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-XSS-Protection', '1; mode=block')
        
        # Cache headers for static assets
        if self.path and any(self.path.endswith(ext) for ext in ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot']):
            self.send_header('Cache-Control', 'public, max-age=31536000')  # 1 year
        else:
            self.send_header('Cache-Control', 'public, max-age=0, must-revalidate')
        
        super().end_headers()
    
    def proxy_to_backend(self):
        """Proxy API requests to backend (emulates CloudFront routing)"""
        if not self.backend_url:
            self.send_error(500, "Backend URL not configured")
            return
        
        try:
            # Build backend URL
            backend_url = f"{self.backend_url}{self.path}"
            
            # Read request body for POST/PUT/PATCH
            request_body = None
            if self.command in ['POST', 'PUT', 'PATCH']:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 0:
                    request_body = self.rfile.read(content_length)
            
            # Forward the request
            req = urllib.request.Request(backend_url, data=request_body, method=self.command)
            
            # Copy headers (except Host)
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'connection']:
                    req.add_header(header, value)
            
            # Make request to backend
            with urllib.request.urlopen(req) as response:
                # Send response
                self.send_response(response.status)
                
                # Copy response headers
                for header, value in response.headers.items():
                    if header.lower() not in ['connection', 'transfer-encoding']:
                        self.send_header(header, value)
                
                self.end_headers()
                
                # Copy response body
                self.wfile.write(response.read())
                
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            print(f"❌ Proxy error: {e}")
            self.send_error(502, f"Bad Gateway: {str(e)}")
    
    def do_GET(self):
        # Proxy API requests to backend (emulates CloudFront routing)
        if self.path.startswith('/api/'):
            return self.proxy_to_backend()
        
        # Handle SPA routing - serve index.html for all non-file requests
        if self.path != '/config/config.json':
            # Check if the path is a file
            file_path = Path(self.path.lstrip('/'))
            if not file_path.exists() or file_path.is_dir():
                # Serve index.html for SPA routing
                self.path = '/index.html'
        
        return super().do_GET()
    
    def do_POST(self):
        # Proxy API requests to backend
        if self.path.startswith('/api/'):
            return self.proxy_to_backend()
        else:
            self.send_error(405, "Method Not Allowed")
    
    def do_PUT(self):
        # Proxy API requests to backend
        if self.path.startswith('/api/'):
            return self.proxy_to_backend()
        else:
            self.send_error(405, "Method Not Allowed")
    
    def do_DELETE(self):
        # Proxy API requests to backend
        if self.path.startswith('/api/'):
            return self.proxy_to_backend()
        else:
            self.send_error(405, "Method Not Allowed")

def find_available_port(start_port=8080, max_attempts=10):
    """Find an available port starting from start_port"""
    import socket
    
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('', port))
                return port
        except OSError:
            continue
    return None

def load_config():
    """Load and validate webapp configuration"""
    config_path = Path('config.json')
    
    if not config_path.exists():
        print("❌ Config file 'config.json' not found in current directory")
        print("   Make sure you're running from the webapp build directory")
        print("   Expected structure: webapp/config.json, webapp/index.html, etc.")
        sys.exit(1)
    
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in config.json: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Failed to read config.json: {e}")
        sys.exit(1)
    
    # Validate required fields
    if not config.get('webapp', {}).get('server', {}).get('port'):
        print("❌ Missing required config: webapp.server.port")
        print("   Check configuration structure in config.json")
        sys.exit(1)
    
    return config

def main():
    # Load configuration
    config = load_config()
    PORT = config['webapp']['server']['port']
    
    # Get backend URL for proxying
    backend_url = config['webapp'].get('api', {}).get('proxyTarget')
    if backend_url:
        CloudFrontEmulator.backend_url = backend_url
        print(f"🔀 API proxy: /api/* → {backend_url}")
    else:
        print(f"⚠️  No API proxy configured (api.proxyTarget missing)")
    
    print(f"🌐 CloudFront+S3 emulator starting...")
    print(f"📁 Serving from: {os.getcwd()}")
    print(f"🔧 Config port: {PORT}")
    
    # Try to find an available port
    available_port = find_available_port(PORT)
    if available_port is None:
        print(f"❌ No available ports found in range {PORT}-{PORT+9}")
        sys.exit(1)
    
    if available_port != PORT:
        print(f"⚠️  Port {PORT} is busy, using port {available_port}")
        PORT = available_port
    
    print(f"🌍 URL: \033[35mhttp://localhost:{PORT}\033[0m")
    print(f"🔧 \033[33mPress Ctrl+C to stop\033[0m")
    print()
    
    # Set up graceful shutdown
    def signal_handler(signum, frame):
        print("\n🛑 Shutting down server...")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        # Use allow_reuse_address to prevent "Address already in use" errors
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("", PORT), CloudFrontEmulator) as httpd:
            print(f"✅ Server running on http://localhost:{PORT}")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down server...")
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ Port {PORT} is still in use. Try again in a few seconds or use a different port:")
            print(f"   PORT={PORT+1} python serve.py")
        else:
            print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 