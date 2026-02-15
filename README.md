# Expense Tracker

A modern, open-source web application for tracking personal expenses and income, fully written by AI!

## 🚀 Welcome to the AI-Powered Expense Tracker!

This system is entirely AI-written, born from my personal journey to test out vibe-coding and familiarize myself with AI coding tools, all while building something genuinely useful. I've leveraged various AI assistants like Cursor, Codex, Jules, and Gemini throughout its development.

I've been using this system to meticulously track my family's expenses since July 2025, and it has proven incredibly valuable. The core idea is simple: you can download your transaction data from different banks and credit card websites as CSV files and import them here to consolidate and manage all your expenses in one place. My personal workflow involves doing this monthly. If you're looking for a robust, customizable way to manage your finances, feel free to spin up the website locally using the instructions below!

## 🛠️ Getting Started

Follow these steps to set up and run the Expense Tracker locally.

### Prerequisites

Before you begin, ensure you have the following installed:

-   **[Node.js](https://nodejs.org/)** (version 14 or higher) & **npm**
-   **[Docker & Docker Compose](https://www.docker.com/get-started/)**: Required to run the PostgreSQL database.

### Quick Setup

To get the Expense Tracker up and running quickly, follow these steps:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/smitkiri/expense-tracker.git
    cd expense_tracker
    ```

2.  **Run the setup script:**

    ```bash
    sh start.sh
    ```

Once the script completes, the application will automatically open in your web browser at `http://localhost:3000`. This script is idempotent, meaning you can run it multiple times safely.

### Manual Setup (Advanced)

If you prefer to set up the project manually or troubleshoot, here are the detailed steps:

#### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/smitkiri/expense-tracker.git
    cd expense_tracker
    ```

2.  **Install project dependencies:**

    ```bash
    npm install
    ```

#### Database Setup (PostgreSQL with Docker)

The application uses PostgreSQL for data storage. We'll use Docker to easily set up a local instance.

1.  **Start the PostgreSQL container:**

    ```bash
    npm run docker:up
    ```
    This command will start a PostgreSQL container in the background. You can verify it's running with `docker ps`.

2.  **Run database migrations:**

    ```bash
    npm run migrate
    ```
    This will create the necessary tables and schema in your PostgreSQL database.

#### Running the Application

Once the dependencies are installed and the database is set up, you can start the application.

1.  **Start both the backend server and the frontend development server:**

    ```bash
    npm run dev
    ```

    This command uses `concurrently` to run `node server.js` (backend) and `react-scripts start` (frontend) simultaneously.

2.  **Access the application:**

    Open your web browser and navigate to `http://localhost:3000`.

    The application will automatically open in your default browser once the frontend server is ready.

### Building for Production

To create a production-ready build of the frontend:

```bash
npm run build
```
## ✨ Features

- 💰 **Track Expenses & Income**: Add, edit, and delete transactions
- 👥 **Multi-User Support**: Manage multiple users with individual transaction tracking
- 🤖 **Intelligent Category Matching**: Auto-suggest categories based on similar transaction descriptions
- 📊 **Visual Analytics**: Interactive charts showing spending patterns and trends
- 📈 **Real-time Statistics**: Live updates of totals and net amounts
- 🏷️ **Category Management**: Organize transactions by categories with dedicated settings
- 📁 **Advanced CSV Import/Export**: Import any CSV structure with column mapping and preview editing
- 🔍 **Advanced Filtering & Search**: Full-text search, date presets, amount ranges, and save/load filter configurations
- 📅 **Global Date Range Picker**: Synchronized date filtering across dashboard and transactions
- 📱 **Responsive Design**: Works perfectly on desktop and mobile
- 🎨 **Dark Mode**: Beautiful dark theme with automatic system preference detection
- 🔄 **Smart Transfer Detection**: Automatically detect and handle internal transfers between accounts
- 📋 **Transaction Details**: Detailed view of transactions with metadata and transfer information
- 📊 **Report Builder**: Create custom reports with advanced filtering and data analysis
- 🔧 **Settings Management**: Comprehensive settings modal for categories, sources, users, and data management
- 🧪 **Test Mode**: Safe testing environment with separate data storage

## 📝 Usage

### Basic Workflow: Importing CSV Data

The primary way to get data into the system is by importing CSV files from your bank or credit card statements.

1.  **Download CSVs**: Obtain transaction CSVs from your financial institutions.
2.  **Import**: In the application, click "Import CSV".
3.  **Map Columns**: The system will guide you through mapping columns from your CSV to transaction fields (Date, Description, Amount, etc.). You can save these mappings for future imports from the same source.
4.  **Review & Edit**: Preview your data, make any necessary edits, and let the intelligent category matching suggest categories for uncategorized transactions.
5.  **Save**: Import the transactions, and they'll be added to your tracker!

### Key Features Explained:

*   **Multi-User Support**: Create separate profiles to track expenses for different individuals (e.g., family members).
*   **Intelligent Category Matching**: When importing, the system can learn from your past categorization and suggest categories for new, uncategorized transactions.
*   **Visual Analytics**: Explore your spending habits with interactive charts that break down expenses by category, show trends over time, and visualize your net income.
*   **Advanced Filtering & Search**: Quickly find specific transactions using full-text search, date ranges, amount filters, and custom labels. You can also save your favorite filter configurations.
*   **Report Builder**: Generate custom reports based on your filtered data, allowing for deeper analysis and insights into your financial health.
*   **Smart Transfer Detection**: The system intelligently identifies and handles internal transfers between your accounts, preventing them from skewing your income/expense reports.

### Further Usage Details:

For more in-depth information on managing users, categories, advanced filtering, and other features, please refer to the detailed sections in the original `README.md` (if you are viewing this on GitHub, these details were available prior to this update and will be re-added below).

## 🧑‍💻 Technology Stack

-   **Frontend**: React 18 with TypeScript
-   **Backend**: Node.js with Express
-   **Database**: PostgreSQL
-   **Styling**: Tailwind CSS
-   **Charts**: Recharts
-   **Icons**: Lucide React
-   **Build Tool**: Create React App
-   **State Management**: React Context for theme and test mode
-   **Notifications**: React Toastify for toast notifications
-   **Date Handling**: date-fns for date manipulation

## 🤝 Contributing

We welcome contributions! Please feel free to fork the repository, make your changes, and submit a pull request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## ❓ Support

If you encounter any issues or have questions, please open an issue on GitHub.
