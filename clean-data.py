import pandas as pd
import numpy
import json

def clean(df):

    # convert to datetime
    dt = pd.to_datetime(df['issue_date_and_time'])

    # add individual datetime columns
    df['month'] = dt.dt.month
    df['year'] = dt.dt.year
    df['day'] = dt.dt.day
    df['dayofweek'] = dt.dt.dayofweek
    df['hour'] = dt.dt.hour

    # fix longitude and latitude
    df['latitude'] = numpy.where(df.lat.values > 0, df.lat.values, df.lng.values)
    df['longitude'] = numpy.where(df.lng.values < 0, df.lng.values, df.lat.values)

    # categorize violation description
    descs = df['violation_description'].unique()
    df['short_desc'] = df['violation_description'].apply(lambda x: x[:10].strip())

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
    df['violation_description'] = df['short_desc'].map(lambda x: categories[x] if x in categories else 'OTHER')

    # remove bad zip codes
    df = df.loc[df['violation_location_zip']!=88888]

    # fix issuing agency names
    names = {'HOUSIN': 'HOUSING', 'POST O':'POST OFFICE', 'FAIRMN':'FAIRMOUNT'}
    for name in names:
        index = df['issuing_agency']==name
        df.loc[index, 'issuing_agency'] = names[name]

    # convert timestamp data to proper format
    df['timestamp'] = dt.dt.strftime("%Y-%m-%d %H:00:00") # zero out minutes/seconds

    return df

if __name__ == '__main__':

    # read the original data
    df = pd.read_csv('data/parking_violations.csv')

    # cleaned data frame
    cleaned = clean(df)

    # columns to save
    cols_to_keep = ['latitude', 'longitude', 'timestamp', 'fine',
                    'violation_location_zip', 'dayofweek', 'hour',
                    'violation_description', 'issuing_agency'
                    ]

    # write out each month/year
    for year in range(2012, 2017):
        print("writing year %d..." %year)
        for month in range(1, 13):
            print("  writing month %d..." %month)

            df_clean = cleaned.loc[(df.month==month)&(df.year==year)]
            df_clean = df_clean[cols_to_keep].dropna()
            df_clean.to_json('data/parking_violations_%d_%d.json.gz' %(month, year), compression='gzip')
