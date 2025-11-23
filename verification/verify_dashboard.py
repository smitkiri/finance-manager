
from playwright.sync_api import sync_playwright
import time

def verify_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Wait for the app to start (npm run dev takes a moment)
        print("Waiting for app to start...")
        time.sleep(10)

        try:
            print("Navigating to http://localhost:3000")
            page.goto("http://localhost:3000")

            print("Waiting for dashboard...")
            page.wait_for_selector("h1", timeout=30000)

            # Check title
            title = page.title()
            print(f"Page title: {title}")

            # Take a screenshot of the dashboard
            screenshot_path = "verification/dashboard.png"
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"Error: {e}")
            # Take screenshot of error state if possible
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_app()
