import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> Navigate to http://localhost:5174/
        await page.goto("http://localhost:5174/")
        
        # -> Navigate to /inventory on the current site (use http://localhost:5174/inventory).
        await page.goto("http://localhost:5174/inventory")
        
        # -> Open the frontend on the alternate host (http://127.0.0.1:5173/inventory) to find interactive elements (eye icon, confirm button) so the test can proceed.
        await page.goto("http://127.0.0.1:5173/inventory")
        
        # -> Navigate to the frontend root (http://127.0.0.1:5173) to check whether the SPA loads and interactive elements become available.
        await page.goto("http://127.0.0.1:5173")
        
        # -> Wait briefly to allow SPA to render; if still empty, open backend at http://127.0.0.1:8000 in a new tab to check server availability.
        await page.goto("http://127.0.0.1:8000")
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'No se pudo confirmar: estado inválido')]").nth(0).is_visible(), "Expected 'No se pudo confirmar: estado inválido' to be visible"
        assert await frame.locator("xpath=//*[contains(., 'DRAFT')]").nth(0).is_visible(), "Expected 'DRAFT' to be visible"
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    