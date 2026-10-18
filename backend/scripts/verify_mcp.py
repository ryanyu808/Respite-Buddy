"""Initialize a running MCP endpoint and call the public, explicitly labeled demo."""
import argparse
import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


async def verify(url):
    async with streamable_http_client(url) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            names = {tool.name for tool in (await session.list_tools()).tools}
            expected = {'find_reset_spots','swap_spot','plan_day','get_spot_details'}
            if not expected <= names:
                raise RuntimeError('MCP discovery is missing required tools.')
            result = await session.call_tool('find_reset_spots', {
                'near':'Leavey','next_class':'TCC','minutes':20,'needs':['quiet'],'demo':True,
            })
            if result.isError:
                raise RuntimeError('The MCP demonstration tool call failed.')
            payload = result.structuredContent
            print('Tools:', ', '.join(sorted(names)))
            print('Demo recommendations:', len(payload['recommendations']))
            for entry in payload['recommendations']:
                print(entry['spot']['name'], entry['rest_min'], 'minutes to rest')
                print(entry['deep_link'])
            print(payload['support'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url', nargs='?', default='http://localhost:8000/mcp/')
    asyncio.run(verify(parser.parse_args().url))
