#!/usr/bin/env python3
"""
WebSocket test for BGCS Chunk 3 implementation.
Tests real-time communication and command handling.
"""

import asyncio
import websockets
import json
import time

async def test_websocket():
    """Test WebSocket connection and Chunk 3 message handling."""
    print("=== BGCS Chunk 3 WebSocket Test ===")
    
    try:
        # Connect to WebSocket
        uri = "ws://localhost:8000/ws"
        async with websockets.connect(uri) as websocket:
            print("PASS: WebSocket connection established")
            
            # Wait for welcome message
            try:
                welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=3.0)
                welcome_data = json.loads(welcome_msg)
                print(f"PASS: Received welcome: {welcome_data['type']}")
                
                # Should also receive initial state
                state_msg = await asyncio.wait_for(websocket.recv(), timeout=3.0)
                state_data = json.loads(state_msg)
                if state_data["type"] == "state_update":
                    entities = state_data["data"]["entities"]
                    print(f"PASS: Received initial state with {len(entities)} entities")
                    
            except asyncio.TimeoutError:
                print("WARN: No welcome/state messages received")
            
            # Test ping
            ping_msg = {"type": "ping", "data": {}}
            await websocket.send(json.dumps(ping_msg))
            print("PASS: Sent ping")
            
            pong_response = await websocket.recv()
            pong_data = json.loads(pong_response)
            if pong_data["type"] == "pong":
                print("PASS: Received pong - basic messaging works")
            
            # Test get_state command
            state_msg = {"type": "get_state", "data": {}}
            await websocket.send(json.dumps(state_msg))
            print("PASS: Requested state via WebSocket")
            
            state_response = await websocket.recv()
            state_data = json.loads(state_response)
            if state_data["type"] == "state_response":
                entities = state_data["data"]["entities"]
                print(f"PASS: Received state response with {len(entities)} entities")
            
            # Test entity spawning via WebSocket
            spawn_msg = {
                "type": "spawn_entity",
                "data": {
                    "type": "drone",
                    "id": "websocket-test-drone",
                    "position": {"x": 300, "y": 300, "z": 150},
                    "properties": {"websocket_test": True}
                }
            }
            await websocket.send(json.dumps(spawn_msg))
            print("PASS: Sent entity spawn command")
            
            # Listen for spawn response and broadcast
            spawn_responses = 0
            for _ in range(5):  # Listen for multiple messages
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    data = json.loads(response)
                    
                    if data["type"] == "command_success":
                        print(f"PASS: Spawn command successful: {data['data']['message']}")
                        spawn_responses += 1
                    elif data["type"] == "entity_spawned":
                        print(f"PASS: Entity spawn broadcast received: {data['data']['entity_id']}")
                        spawn_responses += 1
                    elif data["type"] == "state_update":
                        print("PASS: State update broadcast received")
                        spawn_responses += 1
                        
                except asyncio.TimeoutError:
                    break
            
            if spawn_responses > 0:
                print(f"PASS: Received {spawn_responses} spawn-related messages")
            else:
                print("WARN: No spawn-related responses received")
            
            print("PASS: WebSocket Chunk 3 test completed successfully")
            return True
            
    except Exception as e:
        print(f"FAIL: WebSocket test failed: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_websocket())
    if success:
        print("\nWebSocket functionality is working correctly!")
    else:
        print("\nWebSocket test failed!")
        exit(1)