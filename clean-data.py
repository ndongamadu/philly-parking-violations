import pandas as pd
import numpy
import json


def clean(df):

    # convert to datetime
    dt = pd.to_datetime(df['issue_datetime'])

    # add individual datetime columns
    df['month'] = dt.dt.month
    df['year'] = dt.dt.year
    df['day'] = dt.dt.day
    df['dayofweek'] = dt.dt.dayofweek
    df['hour'] = dt.dt.hour

    # categorize violation description
    descs = df['violation_desc'].unique()
    df['short_desc'] = df['violation_desc'].apply(
        lambda x: x[:10].strip())

    # group by description
    grps = df.groupby('short_desc')
    sizes = grps.size().sort_values()

    # get the top N violation descriptions
    N = 25
    categories = {}
    for val in sizes.index[-N:]:
        for desc in descs:
            if desc.startswith(val):
                d = desc.replace('CC', '')
                d = d.replace('HP', 'HANDICAP')
                d = d.replace('VEH', 'VEHICLE')
                d = d.strip()
                categories[val] = d
                break

    # save top N, else set to OTHER
    df['violation_desc'] = df['short_desc'].map(
        lambda x: categories[x] if x in categories else 'OTHER')

    # fix issuing agency names
    names = {'HOUSIN': 'HOUSING',
             'POST O': 'POST OFFICE', 'FAIRMN': 'FAIRMOUNT'}
    for name in names:
        index = df['issuing_agency'] == name
        df.loc[index, 'issuing_agency'] = names[name]

    # convert timestamp data to proper format
    df['timestamp'] = dt.dt.strftime(
        "%Y-%m-%d %H:00:00")  # zero out minutes/seconds

    # rename columns
    df = df.rename(columns={'lat': 'latitude',
                            'lon': 'longitude',
                            'zip_code': 'violation_location_zip',
                            'violation_desc': 'violation_description'})
    return df


if __name__ == '__main__':

    # read the original data
    df = pd.read_csv('data/parking_violations.csv')
    print('done reading...')

    # cleaned data frame
    cleaned = clean(df)
    print('done cleaning...')

    # columns to save
    cols_to_keep = ['latitude', 'longitude', 'timestamp', 'fine',
                    'violation_location_zip', 'dayofweek', 'hour',
                    'violation_description', 'issuing_agency', 'location'
                    ]

    # write out each month/year
    years = sorted(cleaned['year'].unique())
    months = sorted(cleaned['month'].unique())
    for year in years:
        print("writing year %d..." % year)
        for month in months:
            print("  writing month %d..." % month)

            df_clean = cleaned.loc[(df.month == month) & (df.year == year)]
            df_clean = df_clean[cols_to_keep].dropna()
            df_clean.to_json('data/parking_violations_%d_%d.json.gz' %
                             (month, year), compression='gzip')
