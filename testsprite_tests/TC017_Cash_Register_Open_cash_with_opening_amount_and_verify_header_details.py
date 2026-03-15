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
        
        # -> Navigate to /caja by navigating to http://localhost:5174/caja and then verify the 'Sin caja abierta' text is visible.
        await page.goto("http://localhost:5174/caja")
        
        # -> Click the 'Continuar con Google' button to attempt login so the /caja page can be accessed and the cash-register flow can be tested.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div/div[2]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Navigate to the frontend at http://127.0.0.1:5173/caja to attempt to reach the cash-register page and continue the test (if redirected to login, will handle authentication flow next).
        await page.goto("http://127.0.0.1:5173/caja")
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'Sin caja abierta')]").nth(0).is_visible(), "Expected 'Sin caja abierta' to be visible"
        assert await frame.locator("xpath=//*[contains(., 'Cerrar Caja')]").nth(0).is_visible(), "Expected 'Cerrar Caja' to be visible"
        assert await frame.locator("xpath=//*[contains(., 'Monto apertura')]").nth(0).is_visible(), "Expected 'Monto apertura' to be visible"
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    