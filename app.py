import pandas as pd
from flask import Flask
from flask import render_template, request
import json
import os

# current directory
curr_dir = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/data")
def get_data():

    # get the year and month of data to load
    year = request.args.get('year', default=2017, type=int)
    month = request.args.get('month', default=1, type=int)

    # read the parking violation json data
    filename = os.path.join(
        curr_dir, 'data', 'parking_violations_%d_%d.json.gz' % (month, year))
    df = pd.read_json(filename, convert_dates=False)

    # return data
    return df.to_json(orient='records')


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)
