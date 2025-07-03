# VAYU

VAYU is a group major project primarily built with Jupyter Notebooks and Python, supplemented by C++, TypeScript, and JavaScript components. The repository focuses on real-time AQI prediction based on past 24-hour trends, leveraging the [Time Kolmogorov Arnold Network (TKAN)](https://github.com/remigenet/TKAN/tree/main) and potentially other architectures for comparative analysis.

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Contributors](#contributors)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Project Overview

VAYU aims to provide a robust framework for real-time Air Quality Index (AQI) prediction. The codebase leverages Jupyter Notebooks for interactive exploration, Python for core logic, C++ for performance-critical modules, and TypeScript/JavaScript for frontend or visualization components. The project is inspired by and builds upon the [Time Kolmogorov Arnold Network (TKAN)](https://github.com/remigenet/TKAN/tree/main).

## Features

- Interactive Jupyter Notebooks for experimentation and visualization
- Modular Python scripts for data processing and analysis
- TypeScript frontend for interactive dashboards or web-based tools
- Real-time AQI prediction based on past 24-hour data

## Installation

### Prerequisites

- Python 3.8+
- Jupyter Notebook or JupyterLab

### Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/dsid271/VAYU.git
   cd VAYU
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **(Optional) Install additional dependencies for C++ or JS components:**
   - For C++: Refer to the specific folder's README or build instructions.
   - For TypeScript/JavaScript:
     ```bash
     cd path/to/ts-js-component
     npm install
     npm run build
     ```

4. **Launch Jupyter Notebook:**
   ```bash
   jupyter notebook
   ```

## Usage

- Open the relevant Jupyter Notebooks from the root or `notebooks/` directory.
- Execute cells step by step, following the instructions provided in each notebook.
- For Python scripts, run:
  ```bash
  python path/to/script.py
  ```
- For C++ modules: (add specific build and run instructions)
- For TypeScript/JavaScript frontend: (add instructions to start the frontend, if any)

## Project Structure

```
VAYU/
├── notebooks/          # Jupyter Notebooks for exploration and demos
├── src/                # Python source code
├── cpp/                # C++ modules or extensions
├── frontend/           # TypeScript/JavaScript frontend (if any)
├── data/               # Sample data or datasets (add .gitignore if needed)
├── requirements.txt    # Python dependencies
├── README.md           # This file
└── ...                 # Other files and directories
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a pull request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## Contributors

This project is developed by:

- [dsid271](https://github.com/dsid271)
- [sreenikethanreddy](https://github.com/sreenikethanreddy)

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgments

- Inspired by [Time Kolmogorov Arnold Network (TKAN)](https://github.com/remigenet/TKAN/tree/main)
- Initial Dataset from [open-meteo](https://open-meteo.com/)

---
